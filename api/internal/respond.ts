import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Internal endpoint for delayed AI responses.
 * Called fire-and-forget by the webhook to add a natural delay
 * before the bot responds, making the conversation feel human.
 *
 * For first messages: waits 60-90s, sends multi-part response (2-3 messages)
 * For subsequent:     waits 15-30s, sends single message
 */

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth ──
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    conversationId,
    phone,
    name,
    userMessage,
    messageCount,
    conversationContext,
    conversationStatus,
    whatsappMessageId,
  } = req.body;

  if (!conversationId || !phone) {
    return res.status(400).json({ error: 'Missing conversationId or phone' });
  }

  try {
    const { getConversationHistory, saveMessage, upsertLead, markAsScheduled, autoPauseAI } = require('../../lib/conversation');
    const { handleAIConversation } = require('../../lib/ai-handler');
    const { sendTextMessage, sendContactCard } = require('../../lib/whatsapp');
    const { notifyNewLead, notifyCallScheduled } = require('../../lib/email');
    const { pushNewMessage, pushNewLead, pushCallScheduled } = require('../../lib/push');

    // ── Delay (with debounce for rapid messages) ──
    const isFirstMessage = (messageCount || 0) <= 2;
    const delaySecs = isFirstMessage ? randomInt(60, 90) : randomInt(15, 30);
    console.log(`[Respond] Delaying ${delaySecs}s for ${phone} (first: ${isFirstMessage})`);
    await sleep(delaySecs * 1000);

    // ── Debounce: wait for rapid messages to stop ──
    // After the main delay, check if new user messages arrived in the last 10s.
    // If so, another respond invocation is likely handling the latest batch — bail out.
    const { createClient } = require('@supabase/supabase-js');
    const supabaseCheck = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const tenSecsAgo = new Date(Date.now() - 10000).toISOString();
    const { data: recentUserMsgsRaw } = await supabaseCheck
      .from('messages')
      .select('id, timestamp')
      .eq('conversation_id', conversationId)
      .eq('role', 'user')
      .gte('timestamp', tenSecsAgo)
      .order('timestamp', { ascending: false })
      .limit(1);

    if (recentUserMsgsRaw && recentUserMsgsRaw.length > 0) {
      // A newer user message arrived recently — wait an extra 12s for more rapid messages
      console.log(`[Respond] Debounce: new user message detected, waiting 12s more for ${phone}`);
      await sleep(12000);
    }

    // ── Check if someone already responded (manual intervention or duplicate) ──
    const history = await getConversationHistory(conversationId, 30);
    if (history.length > 0) {
      const lastMsg = history[history.length - 1];
      if (lastMsg.role === 'assistant') {
        console.log(`[Respond] Already responded for ${conversationId}, skipping`);
        return res.status(200).json({ skipped: 'already_responded' });
      }
    }

    // ── Anti-double-message: check if bot already responded AFTER the latest user message ──
    // This prevents duplicate responses from parallel invocations without blocking
    // legitimate responses when the user replies quickly after a bot message.
    // We find the latest user message timestamp, then check if any bot message exists after it.
    const { data: latestUserMsg } = await supabaseCheck
      .from('messages')
      .select('timestamp')
      .eq('conversation_id', conversationId)
      .eq('role', 'user')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (latestUserMsg) {
      const { data: botMsgAfterUser } = await supabaseCheck
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('role', 'assistant')
        .gt('timestamp', latestUserMsg.timestamp)
        .limit(1);

      if (botMsgAfterUser && botMsgAfterUser.length > 0) {
        console.log(`[Respond] Anti-double: bot already responded after last user msg for ${conversationId}`);
        return res.status(200).json({ skipped: 'anti_double_message' });
      }
    }

    // ── WhatsApp messageId deduplication (prevents race condition from webhook retries) ──
    // If the messages table has a whatsapp_message_id column with a UNIQUE constraint,
    // this insert will fail for any duplicate invocation — gracefully degrading otherwise.
    if (whatsappMessageId) {
      const { error: dedupError } = await supabaseCheck
        .from('respond_locks')
        .insert({ whatsapp_message_id: whatsappMessageId, conversation_id: conversationId })
        .select();

      if (dedupError) {
        // 23505 = unique_violation — another invocation already claimed this message
        if (dedupError.code === '23505') {
          console.log(`[Respond] Dedup: messageId ${whatsappMessageId} already claimed, skipping`);
          return res.status(200).json({ skipped: 'duplicate_message_id' });
        }
        // Any other error (e.g. table doesn't exist yet) — continue without dedup protection
        console.warn(`[Respond] Dedup table unavailable (${dedupError.code}), proceeding without lock`);
      }
    }

    // ── Aggregate all pending user messages since last bot response ──
    // This combines rapid-fire messages ("El día de hoy" + "Al medio día" + "Soy Mario") into one prompt
    const lastBotMsgIndex = [...history].reverse().findIndex((m: any) => m.role === 'assistant');
    const pendingUserMsgs = lastBotMsgIndex === -1
      ? history.filter((m: any) => m.role === 'user')
      : history.slice(history.length - lastBotMsgIndex).filter((m: any) => m.role === 'user');

    const aggregatedUserMessage = pendingUserMsgs.length > 1
      ? pendingUserMsgs.map((m: any) => m.content).join('\n')
      : (userMessage || history.filter((m: any) => m.role === 'user').pop()?.content || '');

    console.log(`[Respond] Aggregated ${pendingUserMsgs.length} user message(s) for ${phone}`);

    // ── Generate AI response ──
    const aiPromptText = aggregatedUserMessage;

    let aiResponse;
    try {
      aiResponse = await handleAIConversation(
        aiPromptText,
        history.filter((m: any) => m.role !== 'system'),
        messageCount || 0,
        conversationContext,
        { multiPart: isFirstMessage, phone }
      );
    } catch (aiError) {
      console.error('[Respond] AI handler failed:', aiError);
      const fallbackText = '¡Hola! Gracias por escribirnos 😊 En este momento estoy teniendo una dificultad técnica. Un asesor de Bolt se pondrá en contacto con usted a la brevedad.\n\nHi! Thanks for reaching out 😊 We\'re experiencing a brief technical issue. A Bolt advisor will contact you shortly.';
      await saveMessage(conversationId, 'assistant', fallbackText, 'ai');
      await sendTextMessage(phone, fallbackText);
      return res.status(200).json({ fallback: true });
    }

    // ── Send response (multi-part for first messages) ──
    let parts: string[];

    if (isFirstMessage) {
      // Try splitting by --- delimiter first, then fall back to \n\n
      if (aiResponse.text.includes('---')) {
        parts = aiResponse.text.split('---').map((p: string) => p.trim()).filter((p: string) => p);
      } else {
        // Split by double newline (natural paragraph break)
        parts = aiResponse.text.split(/\n\n+/).map((p: string) => p.trim()).filter((p: string) => p);
        // Cap at 3 parts max
        if (parts.length > 3) parts = [parts.slice(0, 2).join('\n\n'), parts.slice(2).join('\n\n')];
      }
    } else {
      // Subsequent messages: single message
      parts = [aiResponse.text.replace(/\n?---\n?/g, '\n\n').trim()];
    }

    if (parts.length > 1) {
      for (let i = 0; i < parts.length; i++) {
        await sendTextMessage(phone, parts[i]);
        if (i < parts.length - 1) {
          await sleep(randomInt(5, 8) * 1000);
        }
      }
      await saveMessage(conversationId, 'assistant', parts.join('\n\n'), 'ai');
    } else {
      await saveMessage(conversationId, 'assistant', parts[0], 'ai');
      await sendTextMessage(phone, parts[0]);
    }

    // ── Auto-pause AI if triggered ──
    if (aiResponse.shouldAutoPause) {
      await autoPauseAI(conversationId, aiResponse.shouldAutoPause);
      console.log(`[Respond] AI auto-paused for ${conversationId}: ${aiResponse.shouldAutoPause}`);
    }

    // ── Notifications ──
    const notifications: Promise<any>[] = [];

    notifications.push(
      pushNewMessage({
        name: name,
        phone: phone,
        preview: aiPromptText,
        conversationId,
      }).catch((err: any) => console.error('[Push] pushNewMessage failed:', err))
    );

    // ── Lead/schedule logic (only if not already scheduled) ──
    if (conversationStatus !== 'scheduled') {
      const isScheduleConfirmation = aiResponse.intent === 'confirm_schedule';

      if (aiResponse.detectedProjectType || isScheduleConfirmation) {
        await upsertLead({
          conversationId,
          name: name || undefined,
          phone: phone,
          projectType: aiResponse.detectedProjectType || undefined,
          preferredDatetime: aiResponse.detectedDatetime || undefined,
          status: isScheduleConfirmation ? 'scheduled' : 'contacted',
        });
      }

      if (isScheduleConfirmation && aiResponse.detectedDatetime) {
        await markAsScheduled(conversationId, aiResponse.detectedDatetime);

        const advisorPhone = process.env.BOLT_ADVISOR_PHONE;
        const advisorName = process.env.BOLT_ADVISOR_NAME || 'Bolt - Asesor';
        if (advisorPhone) {
          try {
            await sendContactCard(phone, advisorName, advisorPhone, 'Bolt');
            console.log(`[Respond] Sent advisor contact card to ${phone}`);
          } catch (err) {
            console.error('[Respond] Failed to send advisor contact card:', err);
          }
        }

        notifications.push(
          notifyCallScheduled({
            name,
            phone,
            datetime: aiResponse.detectedDatetime,
            conversationId,
          }).catch((err: any) => console.error('[Email] notifyCallScheduled failed:', err))
        );
        notifications.push(
          pushCallScheduled({
            name,
            datetime: aiResponse.detectedDatetime,
            conversationId,
          }).catch((err: any) => console.error('[Push] pushCallScheduled failed:', err))
        );
      }

      const isFirstProjectMention =
        aiResponse.detectedProjectType && (messageCount || 0) <= 3;

      if (isFirstProjectMention) {
        notifications.push(
          notifyNewLead({
            name,
            phone,
            projectType: aiResponse.detectedProjectType,
            conversationId,
          }).catch((err: any) => console.error('[Email] notifyNewLead failed:', err))
        );
        notifications.push(
          pushNewLead({
            name,
            projectType: aiResponse.detectedProjectType,
            conversationId,
          }).catch((err: any) => console.error('[Push] pushNewLead failed:', err))
        );
      }
    }

    await Promise.allSettled(notifications);
    console.log(`[Respond] Completed for ${phone} (${conversationId})`);
    return res.status(200).json({ completed: true });
  } catch (error) {
    console.error('[Respond] Error:', error);
    return res.status(500).json({ error: 'Processing failed' });
  }
}

import { NextRequest, NextResponse } from 'next/server';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const maxDuration = 180; // 3 minutes

export async function POST(req: NextRequest) {
  // ── Auth ──
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
  } = await req.json();

  if (!conversationId || !phone) {
    return NextResponse.json({ error: 'Missing conversationId or phone' }, { status: 400 });
  }

  try {
    const { getConversationHistory, saveMessage, upsertLead, markAsScheduled, autoPauseAI } = await import('@lib/conversation');
    const { handleAIConversation } = await import('@lib/ai-handler');
    const { sendTextMessage, sendContactCard } = await import('@lib/whatsapp');
    const { notifyNewLead, notifyCallScheduled } = await import('@lib/email');
    const { pushNewMessage, pushNewLead, pushCallScheduled } = await import('@lib/push');
    const { createClient } = await import('@supabase/supabase-js');

    // ── Delay ──
    const isFirstMessage = (messageCount || 0) <= 2;
    const delaySecs = isFirstMessage ? randomInt(60, 90) : randomInt(15, 30);
    console.log(`[Respond] Delaying ${delaySecs}s for ${phone}`);
    await sleep(delaySecs * 1000);

    // ── Debounce check ──
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
      console.log(`[Respond] Debounce: new user message, waiting 12s more for ${phone}`);
      await sleep(12000);
    }

    // ── Check if already responded ──
    const history = await getConversationHistory(conversationId, 30);
    if (history.length > 0) {
      const lastMsg = history[history.length - 1];
      if (lastMsg.role === 'assistant') {
        console.log(`[Respond] Already responded for ${conversationId}, skipping`);
        return NextResponse.json({ skipped: 'already_responded' });
      }
    }

    // ── Anti-double-message ──
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
        console.log(`[Respond] Anti-double: bot already responded for ${conversationId}`);
        return NextResponse.json({ skipped: 'anti_double_message' });
      }
    }

    // ── WhatsApp messageId deduplication ──
    if (whatsappMessageId) {
      const { error: dedupError } = await supabaseCheck
        .from('respond_locks')
        .insert({ whatsapp_message_id: whatsappMessageId, conversation_id: conversationId })
        .select();

      if (dedupError) {
        if (dedupError.code === '23505') {
          console.log(`[Respond] Dedup: messageId ${whatsappMessageId} already claimed`);
          return NextResponse.json({ skipped: 'duplicate_message_id' });
        }
        console.warn(`[Respond] Dedup table unavailable (${dedupError.code}), proceeding`);
      }
    }

    // ── Aggregate pending user messages ──
    const lastBotMsgIndex = [...history].reverse().findIndex((m: any) => m.role === 'assistant');
    const pendingUserMsgs = lastBotMsgIndex === -1
      ? history.filter((m: any) => m.role === 'user')
      : history.slice(history.length - lastBotMsgIndex).filter((m: any) => m.role === 'user');

    const aggregatedUserMessage = pendingUserMsgs.length > 1
      ? pendingUserMsgs.map((m: any) => m.content).join('\n')
      : (userMessage || history.filter((m: any) => m.role === 'user').pop()?.content || '');

    console.log(`[Respond] Aggregated ${pendingUserMsgs.length} user message(s) for ${phone}`);

    // ── Generate AI response ──
    let aiResponse;
    try {
      aiResponse = await handleAIConversation(
        aggregatedUserMessage,
        history.filter((m: any) => m.role !== 'system'),
        messageCount || 0,
        conversationContext,
        { multiPart: isFirstMessage, phone }
      );
    } catch (aiError) {
      console.error('[Respond] AI handler failed:', aiError);
      const fallbackText = '¡Hola! Gracias por escribirnos 😊 En este momento estoy teniendo una dificultad técnica. Un asesor de E-MA se pondrá en contacto con usted a la brevedad.';
      await saveMessage(conversationId, 'assistant', fallbackText, 'ai');
      await sendTextMessage(phone, fallbackText);
      return NextResponse.json({ fallback: true });
    }

    // ── Send response ──
    let parts: string[];
    if (isFirstMessage) {
      if (aiResponse.text.includes('---')) {
        parts = aiResponse.text.split('---').map((p: string) => p.trim()).filter((p: string) => p);
      } else {
        parts = aiResponse.text.split(/\n\n+/).map((p: string) => p.trim()).filter((p: string) => p);
        if (parts.length > 3) parts = [parts.slice(0, 2).join('\n\n'), parts.slice(2).join('\n\n')];
      }
    } else {
      parts = [aiResponse.text.replace(/\n?---\n?/g, '\n\n').trim()];
    }

    if (parts.length > 1) {
      for (let i = 0; i < parts.length; i++) {
        await sendTextMessage(phone, parts[i]);
        if (i < parts.length - 1) await sleep(randomInt(5, 8) * 1000);
      }
      await saveMessage(conversationId, 'assistant', parts.join('\n\n'), 'ai');
    } else {
      await saveMessage(conversationId, 'assistant', parts[0], 'ai');
      await sendTextMessage(phone, parts[0]);
    }

    // ── Auto-pause AI ──
    if (aiResponse.shouldAutoPause) {
      await autoPauseAI(conversationId, aiResponse.shouldAutoPause);
    }

    // ── Notifications ──
    const notifications: Promise<any>[] = [];
    notifications.push(
      pushNewMessage({ name, phone, preview: aggregatedUserMessage, conversationId })
        .catch((err: any) => console.error('[Push] pushNewMessage failed:', err))
    );

    if (conversationStatus !== 'scheduled') {
      const isScheduleConfirmation = aiResponse.intent === 'confirm_schedule';

      if (aiResponse.detectedProjectType || isScheduleConfirmation) {
        await upsertLead({
          conversationId,
          name: name || undefined,
          phone,
          projectType: aiResponse.detectedProjectType || undefined,
          preferredDatetime: aiResponse.detectedDatetime || undefined,
          status: isScheduleConfirmation ? 'scheduled' : 'contacted',
        });
      }

      if (isScheduleConfirmation && aiResponse.detectedDatetime) {
        await markAsScheduled(conversationId, aiResponse.detectedDatetime);
        const advisorPhone = process.env.EMA_ADVISOR_PHONE;
        const advisorName = process.env.EMA_ADVISOR_NAME || 'E-MA - Asesor';
        if (advisorPhone) {
          try {
            await sendContactCard(phone, advisorName, advisorPhone, 'E-MA');
          } catch (err) {
            console.error('[Respond] Failed to send advisor contact card:', err);
          }
        }
        notifications.push(
          notifyCallScheduled({ name, phone, datetime: aiResponse.detectedDatetime, conversationId })
            .catch((err: any) => console.error('[Email] notifyCallScheduled failed:', err))
        );
        notifications.push(
          pushCallScheduled({ name, datetime: aiResponse.detectedDatetime, conversationId })
            .catch((err: any) => console.error('[Push] pushCallScheduled failed:', err))
        );
      }

      if (aiResponse.detectedProjectType && (messageCount || 0) <= 3) {
        notifications.push(
          notifyNewLead({ name, phone, projectType: aiResponse.detectedProjectType, conversationId })
            .catch((err: any) => console.error('[Email] notifyNewLead failed:', err))
        );
        notifications.push(
          pushNewLead({ name, projectType: aiResponse.detectedProjectType, conversationId })
            .catch((err: any) => console.error('[Push] pushNewLead failed:', err))
        );
      }
    }

    await Promise.allSettled(notifications);
    console.log(`[Respond] Completed for ${phone} (${conversationId})`);
    return NextResponse.json({ completed: true });
  } catch (error) {
    console.error('[Respond] Error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';

// Disable Vercel's body parser so we can read the raw body for HMAC verification
export const config = {
  api: {
    bodyParser: false,
  },
};

function getRawBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // ── GET: Webhook verification ──
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('[WhatsApp] Webhook verified');
      return res.status(200).send(challenge);
    }

    return res.status(403).json({ error: 'Verification failed' });
  }

  // ── POST: Incoming messages ──
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { parseWebhookPayload, verifyWebhookSignature, sendTextMessage, sendContactCard, markAsRead } = require('../../lib/whatsapp');
    const { getOrCreateConversation, getConversationHistory, saveMessage, upsertLead, markAsScheduled, getLeadByConversation, autoPauseAI, resetFollowupStage } = require('../../lib/conversation');
    const { handleAIConversation } = require('../../lib/ai-handler');

    const rawBody = await getRawBody(req);
    const body = JSON.parse(rawBody);

    // ── Verify signature ──
    if (!verifyWebhookSignature(req, rawBody)) {
      console.error('[WhatsApp] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // ── Parse payload ──
    const message = parseWebhookPayload(body);
    if (!message) {
      return res.status(200).json({ received: true });
    }

    console.log(`[WhatsApp] Message from ${message.from} (${message.mediaType}): "${message.text}"`);
    markAsRead(message.messageId).catch(() => {});

    const { notifyNewLead, notifyCallScheduled } = require('../../lib/email');
    const { pushNewMessage, pushNewLead, pushCallScheduled } = require('../../lib/push');

    // ── Get or create conversation ──
    const conversation = await getOrCreateConversation(message.from, message.name);

    // ── Handle conversation status ──
    // Build context object for the AI based on current status.
    let conversationContext: { status: string; scheduledDatetime?: string | null } | undefined;

    if (conversation.status === 'closed') {
      // Reopen closed conversations — client wants to talk again
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      await supabase
        .from('conversations')
        .update({ status: 'active', ai_paused: false, auto_pause_reason: null, updated_at: new Date().toISOString() })
        .eq('id', conversation.id);
      // Mark as returning lead
      conversationContext = { status: 'active', isReturningLead: true, daysSinceLastContact: 0 };
      console.log(`[WhatsApp] Reopened closed conversation ${conversation.id}`);

    } else if (conversation.status === 'scheduled') {
      // DON'T reopen scheduled conversations. Instead, fetch the scheduled
      // datetime so we can give the AI context about the existing appointment.
      const lead = await getLeadByConversation(conversation.id);
      conversationContext = {
        status: 'scheduled',
        scheduledDatetime: lead?.preferred_datetime || null,
      };
      console.log(`[WhatsApp] Scheduled conversation ${conversation.id}, datetime: ${lead?.preferred_datetime}`);
    }

    // ── Detect returning lead (customer responds after 1+ days of silence) ──
    if (!conversationContext && conversation.last_customer_message_at) {
      const lastContact = new Date(conversation.last_customer_message_at);
      const hoursSilent = (Date.now() - lastContact.getTime()) / (1000 * 60 * 60);
      if (hoursSilent >= 24) {
        const daysSilent = Math.round(hoursSilent / 24);
        conversationContext = {
          status: conversation.status,
          isReturningLead: true,
          daysSinceLastContact: daysSilent,
        };
        console.log(`[WhatsApp] Returning lead detected: ${conversation.id} (${daysSilent} days silent)`);

        // If AI was auto-paused for deferral, unpause it since the customer is back
        if (conversation.ai_paused && conversation.auto_pause_reason) {
          const { createClient } = require('@supabase/supabase-js');
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          );
          await supabase
            .from('conversations')
            .update({ ai_paused: false, auto_pause_reason: null })
            .eq('id', conversation.id);
          conversation.ai_paused = false;
          console.log(`[WhatsApp] Auto-unpaused returning lead: ${conversation.id}`);
        }
      }
    }

    // ── Save user message ──
    const textToSave = message.text;
    await saveMessage(conversation.id, 'user', textToSave, null);

    // ── Reset follow-up stage when customer responds (they're engaged again) ──
    if (conversation.followup_stage && conversation.followup_stage > 0) {
      await resetFollowupStage(conversation.id);
    }

    // ── If AI is paused (manual mode), don't auto-respond ──
    if (conversation.ai_paused) {
      console.log(`[WhatsApp] AI paused for conversation ${conversation.id}, skipping AI response`);
      // Still send push notification so the team knows there's a new message.
      // IMPORTANT: await before returning — Vercel kills the process after res.send()
      await pushNewMessage({
        name: message.name || conversation.lead_name,
        phone: message.from,
        preview: message.text,
        conversationId: conversation.id,
      }).catch((err: any) => console.error('[Push] pushNewMessage failed:', err));
      return res.status(200).json({ received: true, ai_paused: true });
    }

    // ── Skip AI for reactions ──
    if (message.mediaType === 'reaction') {
      return res.status(200).json({ received: true });
    }

    // ── Load conversation history ──
    const history = await getConversationHistory(conversation.id, 20);

    // ── Anti-double-message protection ──
    // If the customer just sent their FIRST message (greeting) and we already have
    // a recent assistant message (e.g., from a manual send), don't auto-respond
    // to avoid the double-message pattern seen with Oscar/Alberto.
    // Exception: if this is a brand new conversation (no prior assistant messages).
    const recentAssistantMsgs = history.filter((m: any) => m.role === 'assistant');
    const recentUserMsgs = history.filter((m: any) => m.role === 'user');
    if (recentAssistantMsgs.length > 0 && recentUserMsgs.length <= 1) {
      // There's already an assistant message but this is only the customer's 1st or 2nd message.
      // Check if the last message before this one was from assistant (we already replied).
      const lastHistoryMsg = history[history.length - 1];
      if (lastHistoryMsg && lastHistoryMsg.role === 'assistant') {
        // The customer is responding to our message — this is fine, proceed normally.
        // But if the customer's message was just saved and the PREVIOUS last was also assistant,
        // that means we sent 2 assistant messages in a row. Don't add a 3rd.
        const lastTwoAssistant = history.slice(-2).every((m: any) => m.role === 'assistant');
        if (lastTwoAssistant) {
          console.log(`[WhatsApp] Anti-double-message: skipping AI response for ${conversation.id} (2 consecutive assistant messages detected)`);
          // Still notify the team
          await pushNewMessage({
            name: message.name || conversation.lead_name,
            phone: message.from,
            preview: message.text,
            conversationId: conversation.id,
          }).catch((err: any) => console.error('[Push] pushNewMessage failed:', err));
          return res.status(200).json({ received: true, skipped: 'anti_double_message' });
        }
      }
    }

    // ── Build prompt for media messages ──
    let aiPromptText = message.text;
    if (message.mediaType !== 'text') {
      const mediaContextMap: Record<string, string> = {
        image: 'El usuario envió una imagen' + (message.mediaCaption ? ` con el texto: "${message.mediaCaption}"` : '. No puedes ver la imagen pero responde amablemente.'),
        audio: 'El usuario envió un mensaje de voz. No puedes escucharlo pero responde amablemente pidiendo que te escriba su mensaje.',
        video: 'El usuario envió un video' + (message.mediaCaption ? ` con el texto: "${message.mediaCaption}"` : '. Responde amablemente.'),
        sticker: 'El usuario envió un sticker/emoji. Responde de manera amigable y continúa la conversación.',
        document: `El usuario envió un documento${message.mediaFilename ? ` llamado "${message.mediaFilename}"` : ''}. Acusa recibido y continúa la conversación.`,
        location: `El usuario compartió su ubicación: ${message.locationName || 'una ubicación'}. Agradece y continúa la conversación.`,
        contacts: 'El usuario compartió un contacto. Agradece y continúa la conversación.',
      };
      aiPromptText = mediaContextMap[message.mediaType] || message.text;
    }

    // ── Call AI handler ──
    let aiResponse;
    try {
      aiResponse = await handleAIConversation(
        aiPromptText,
        history.filter((m: any) => m.role !== 'system'),
        conversation.message_count,
        conversationContext
      );
    } catch (aiError) {
      console.error('[WhatsApp] AI handler failed:', aiError);
      // Send a graceful fallback so the lead doesn't get ignored
      const fallbackText = '¡Hola! Gracias por escribirnos 😊 En este momento estoy teniendo una dificultad técnica. Un asesor de Bolt se pondrá en contacto con usted a la brevedad.\n\nHi! Thanks for reaching out 😊 We\'re experiencing a brief technical issue. A Bolt advisor will contact you shortly.';
      await saveMessage(conversation.id, 'assistant', fallbackText, 'ai');
      await sendTextMessage(message.from, fallbackText);
      return res.status(200).json({ received: true, error: 'AI fallback sent' });
    }

    // ── Save and send AI response ──
    await saveMessage(conversation.id, 'assistant', aiResponse.text, 'ai');
    await sendTextMessage(message.from, aiResponse.text);

    // ── Auto-pause AI if triggered ──
    if (aiResponse.shouldAutoPause) {
      await autoPauseAI(conversation.id, aiResponse.shouldAutoPause);
      console.log(`[WhatsApp] AI auto-paused for ${conversation.id}: ${aiResponse.shouldAutoPause}`);
    }

    // ── Notifications (collected and awaited before returning) ──
    const notifications: Promise<any>[] = [];

    // Push notification for every new user message
    notifications.push(
      pushNewMessage({
        name: message.name || conversation.lead_name,
        phone: message.from,
        preview: message.text,
        conversationId: conversation.id,
      }).catch((err: any) => console.error('[Push] pushNewMessage failed:', err))
    );

    // ═══════════════════════════════════════════════════════════
    // Only process lead/schedule logic if conversation is NOT already scheduled.
    // Once scheduled, we don't want to:
    //   - Re-detect project types
    //   - Re-trigger scheduling (duplicate contact cards, notifications)
    //   - Upsert lead data that could overwrite the scheduled status
    // ═══════════════════════════════════════════════════════════
    if (conversation.status !== 'scheduled') {

      // ── Portfolio: AI now includes the portfolio URL naturally in its
      // text response. No need to send separate image messages. ──

      // ── Upsert lead if project type or schedule detected ──
      const isScheduleConfirmation = aiResponse.intent === 'confirm_schedule';

      if (aiResponse.detectedProjectType || isScheduleConfirmation) {
        await upsertLead({
          conversationId: conversation.id,
          name: message.name || undefined,
          phone: message.from,
          projectType: aiResponse.detectedProjectType || undefined,
          preferredDatetime: aiResponse.detectedDatetime || undefined,
          status: isScheduleConfirmation ? 'scheduled' : 'contacted',
        });
      }

      // ── Handle schedule confirmation ──
      if (isScheduleConfirmation && aiResponse.detectedDatetime) {
        await markAsScheduled(conversation.id, aiResponse.detectedDatetime);

        // Send advisor contact card
        const advisorPhone = process.env.BOLT_ADVISOR_PHONE;
        const advisorName = process.env.BOLT_ADVISOR_NAME || 'Bolt - Asesor';
        if (advisorPhone) {
          try {
            await sendContactCard(message.from, advisorName, advisorPhone, 'Bolt');
            console.log(`[WhatsApp] Sent advisor contact card to ${message.from}`);
          } catch (err) {
            console.error('[WhatsApp] Failed to send advisor contact card:', err);
          }
        }

        // Notify about scheduled call
        notifications.push(
          notifyCallScheduled({
            name: message.name || conversation.lead_name,
            phone: message.from,
            datetime: aiResponse.detectedDatetime,
            conversationId: conversation.id,
          }).catch((err: any) => console.error('[Email] notifyCallScheduled failed:', err))
        );
        notifications.push(
          pushCallScheduled({
            name: message.name || conversation.lead_name,
            datetime: aiResponse.detectedDatetime,
            conversationId: conversation.id,
          }).catch((err: any) => console.error('[Push] pushCallScheduled failed:', err))
        );
      }

      // ── Notify about new lead (first time project type is detected) ──
      const isFirstProjectMention =
        aiResponse.detectedProjectType && conversation.message_count <= 3;

      if (isFirstProjectMention) {
        notifications.push(
          notifyNewLead({
            name: message.name || conversation.lead_name,
            phone: message.from,
            projectType: aiResponse.detectedProjectType,
            conversationId: conversation.id,
          }).catch((err: any) => console.error('[Email] notifyNewLead failed:', err))
        );
        notifications.push(
          pushNewLead({
            name: message.name || conversation.lead_name,
            projectType: aiResponse.detectedProjectType,
            conversationId: conversation.id,
          }).catch((err: any) => console.error('[Push] pushNewLead failed:', err))
        );
      }

    } // end if (conversation.status !== 'scheduled')

    // ── Wait for all notifications before returning ──
    await Promise.allSettled(notifications);

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[WhatsApp] Error processing message:', error);
    return res.status(200).json({ received: true, error: 'Processing failed' });
  }
}

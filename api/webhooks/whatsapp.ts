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
    const { getOrCreateConversation, getConversationHistory, saveMessage, upsertLead, markAsScheduled, getLeadByConversation } = require('../../lib/conversation');
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
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', conversation.id);
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

    // ── Save user message ──
    const textToSave = message.text;
    await saveMessage(conversation.id, 'user', textToSave);

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
      const fallbackText = '¡Hola! Gracias por escribirnos 😊 En este momento estoy teniendo una dificultad técnica. Un asesor de Bolt se pondrá en contacto contigo a la brevedad.';
      await saveMessage(conversation.id, 'assistant', fallbackText);
      await sendTextMessage(message.from, fallbackText);
      return res.status(200).json({ received: true, error: 'AI fallback sent' });
    }

    // ── Save and send AI response ──
    await saveMessage(conversation.id, 'assistant', aiResponse.text);
    await sendTextMessage(message.from, aiResponse.text);

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

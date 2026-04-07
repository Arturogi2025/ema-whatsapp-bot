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
    const { parseWebhookPayload, verifyWebhookSignature, markAsRead } = require('../../lib/whatsapp');
    const { getOrCreateConversation, saveMessage, getLeadByConversation, resetFollowupStage } = require('../../lib/conversation');

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

    const { pushNewMessage } = require('../../lib/push');

    // ── Get or create conversation ──
    const conversation = await getOrCreateConversation(message.from, message.name);

    // ── Handle conversation status ──
    // Build context object for the AI based on current status.
    let conversationContext: { status: string; scheduledDatetime?: string | null; isReturningLead?: boolean; daysSinceLastContact?: number } | undefined;

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

    // ── Trigger delayed response endpoint ──
    // Sends the request and waits just long enough for the connection to establish.
    // The respond endpoint runs independently (separate Vercel function invocation).
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'bolt-whatsapp-ai.vercel.app';
    const respondUrl = `https://${host}/api/internal/respond`;

    const controller = new AbortController();
    const abortTimeout = setTimeout(() => controller.abort(), 3000); // 3s to establish connection
    try {
      await fetch(respondUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify({
          conversationId: conversation.id,
          phone: message.from,
          name: message.name || conversation.lead_name,
          userMessage: aiPromptText,
          messageCount: conversation.message_count,
          conversationContext,
          conversationStatus: conversation.status,
        }),
        signal: controller.signal,
      });
    } catch {
      // Expected: AbortError after 3s — the request was sent, respond endpoint runs independently
    }
    clearTimeout(abortTimeout);

    return res.status(200).json({ received: true, delayed: true });
  } catch (error) {
    console.error('[WhatsApp] Error processing message:', error);
    return res.status(200).json({ received: true, error: 'Processing failed' });
  }
}

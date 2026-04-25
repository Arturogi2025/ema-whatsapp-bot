import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// ── GET: Webhook verification (Meta sends this to verify the endpoint) ──
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[WhatsApp] Webhook verified');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// ── POST: Incoming messages ──
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    // ── Verify HMAC signature ──
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (appSecret) {
      const signature = req.headers.get('x-hub-signature-256') || '';
      const expectedSig = 'sha256=' +
        crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
      const sigOk = signature.length > 0 &&
        crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
      if (!sigOk) {
        console.error('[WhatsApp] Invalid signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else {
      console.warn('[WhatsApp] WHATSAPP_APP_SECRET not set, skipping signature check');
    }

    // ── Dynamic imports to avoid SSR issues with root lib ──
    const { parseWebhookPayload, markAsRead } = await import('@lib/whatsapp');
    const { getOrCreateConversation, saveMessage, getLeadByConversation, resetFollowupStage } = await import('@lib/conversation');

    // ── Parse payload ──
    const message = parseWebhookPayload(body);
    if (!message) {
      return NextResponse.json({ received: true });
    }

    const normalizedPhone = message.from.startsWith('+') ? message.from : `+${message.from}`;
    console.log(`[WhatsApp] Message from ${normalizedPhone} (${message.mediaType}): "${message.text}"`);
    markAsRead(message.messageId).catch(() => {});

    const { pushNewMessage } = await import('@lib/push');

    // ── Get or create conversation ──
    const conversation = await getOrCreateConversation(normalizedPhone, message.name);

    // ── Handle conversation status ──
    let conversationContext: { status: string; scheduledDatetime?: string | null; isReturningLead?: boolean; daysSinceLastContact?: number } | undefined;

    if (conversation.status === 'closed') {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      await supabase
        .from('conversations')
        .update({ status: 'active', ai_paused: false, auto_pause_reason: null, updated_at: new Date().toISOString() })
        .eq('id', conversation.id);
      conversationContext = { status: 'active', isReturningLead: true, daysSinceLastContact: 0 };
      console.log(`[WhatsApp] Reopened closed conversation ${conversation.id}`);

    } else if (conversation.status === 'scheduled') {
      const lead = await getLeadByConversation(conversation.id);
      conversationContext = {
        status: 'scheduled',
        scheduledDatetime: lead?.preferred_datetime || null,
      };
      console.log(`[WhatsApp] Scheduled conversation ${conversation.id}`);
    }

    // ── Detect returning lead ──
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

        if (conversation.ai_paused && conversation.auto_pause_reason) {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          );
          await supabase
            .from('conversations')
            .update({ ai_paused: false, auto_pause_reason: null })
            .eq('id', conversation.id);
          conversation.ai_paused = false;
        }
      }
    }

    // ── Save user message ──
    await saveMessage(conversation.id, 'user', message.text, null);

    // ── Reset follow-up stage ──
    if (conversation.followup_stage && conversation.followup_stage > 0) {
      await resetFollowupStage(conversation.id);
    }

    // ── If AI is paused, don't auto-respond ──
    if (conversation.ai_paused) {
      console.log(`[WhatsApp] AI paused for ${conversation.id}`);
      await pushNewMessage({
        name: message.name || conversation.lead_name,
        phone: normalizedPhone,
        preview: message.text,
        conversationId: conversation.id,
      }).catch((err: any) => console.error('[Push] failed:', err));
      return NextResponse.json({ received: true, ai_paused: true });
    }

    // ── Skip AI for reactions ──
    if (message.mediaType === 'reaction') {
      return NextResponse.json({ received: true });
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

    // ── Trigger respond endpoint (fire and forget) ──
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'ema-whatsapp-bot.vercel.app';
    const respondUrl = `https://${host}/api/internal/respond`;

    const controller = new AbortController();
    const abortTimeout = setTimeout(() => controller.abort(), 3000);
    try {
      await fetch(respondUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify({
          conversationId: conversation.id,
          phone: normalizedPhone,
          name: message.name || conversation.lead_name,
          userMessage: aiPromptText,
          messageCount: conversation.message_count,
          conversationContext,
          conversationStatus: conversation.status,
          whatsappMessageId: message.messageId,
        }),
        signal: controller.signal,
      });
    } catch {
      // Expected: AbortError after 3s — respond endpoint runs independently
    }
    clearTimeout(abortTimeout);

    return NextResponse.json({ received: true, delayed: true });
  } catch (error) {
    console.error('[WhatsApp] Error processing message:', error);
    return NextResponse.json({ received: true, error: 'Processing failed' });
  }
}

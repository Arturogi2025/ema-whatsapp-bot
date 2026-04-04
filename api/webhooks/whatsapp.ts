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
  // GET: Webhook verification
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

  // POST: Incoming messages
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { parseWebhookPayload, verifyWebhookSignature, sendTextMessage, sendImageMessage, sendContactCard, markAsRead } = require('../../lib/whatsapp');
    const { getOrCreateConversation, getConversationHistory, saveMessage, upsertLead, markAsScheduled } = require('../../lib/conversation');
    const { handleAIConversation } = require('../../lib/ai-handler');
    const { getRelevantExamples } = require('../../lib/portfolio');

    const rawBody = await getRawBody(req);
    const body = JSON.parse(rawBody);

    if (!verifyWebhookSignature(req, rawBody)) {
      console.error('[WhatsApp] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const message = parseWebhookPayload(body);
    if (!message) {
      return res.status(200).json({ received: true });
    }

    console.log(`[WhatsApp] Message from ${message.from} (${message.mediaType}): "${message.text}"`);
    markAsRead(message.messageId).catch(() => {});

    const { notifyNewLead, notifyCallScheduled } = require('../../lib/email');
    const { pushNewMessage, pushNewLead, pushCallScheduled } = require('../../lib/push');

    const conversation = await getOrCreateConversation(message.from, message.name);

    // If conversation was closed, reopen it on new message
    if (conversation.status === 'closed') {
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      await supabase
        .from('conversations')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', conversation.id);
    }

    // Build the text to save — for media, include type indicator
    const textToSave = message.text;
    await saveMessage(conversation.id, 'user', textToSave);

    // If AI is paused (manual mode), don't auto-respond
    if (conversation.ai_paused) {
      console.log(`[WhatsApp] AI paused for conversation ${conversation.id}, skipping AI response`);
      return res.status(200).json({ received: true, ai_paused: true });
    }

    // For reactions and some media, skip AI response
    if (message.mediaType === 'reaction') {
      return res.status(200).json({ received: true });
    }

    const history = await getConversationHistory(conversation.id, 20);

    // Build context-aware prompt for media messages
    let aiPromptText = message.text;
    if (message.mediaType !== 'text') {
      // Give AI context about what was sent
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

    const aiResponse = await handleAIConversation(
      aiPromptText,
      history.filter((m: any) => m.role !== 'system'),
      conversation.message_count
    );

    await saveMessage(conversation.id, 'assistant', aiResponse.text);
    await sendTextMessage(message.from, aiResponse.text);

    // Collect all notification promises so we await them before returning
    // (fire-and-forget causes Vercel to kill the process before push/email completes)
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

    if (aiResponse.shouldSendPortfolio && aiResponse.detectedProjectType) {
      const examples = await getRelevantExamples(aiResponse.detectedProjectType, 3);
      for (const example of examples) {
        if (example.image_url) {
          await sendImageMessage(
            message.from,
            example.image_url,
            `*${example.title}*${example.description ? '\n' + example.description : ''}${example.url ? '\n🔗 ' + example.url : ''}`
          );
        } else if (example.url) {
          await sendTextMessage(
            message.from,
            `*${example.title}*${example.description ? '\n' + example.description : ''}\n🔗 ${example.url}`
          );
        }
      }
    }

    const isFirstProjectMention = aiResponse.detectedProjectType && conversation.message_count <= 3;
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

    if (isScheduleConfirmation && aiResponse.detectedDatetime) {
      await markAsScheduled(conversation.id, aiResponse.detectedDatetime);

      // Send advisor contact card if BOLT_ADVISOR_PHONE is configured
      const advisorPhone = process.env.BOLT_ADVISOR_PHONE;
      const advisorName = process.env.BOLT_ADVISOR_NAME || 'Bolt - Asesor';
      if (advisorPhone) {
        try {
          await sendContactCard(message.from, advisorName, advisorPhone, 'Bolt');
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

    // Notify about new lead (first time project type is detected)
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

    // Wait for all notifications to complete before returning
    await Promise.allSettled(notifications);

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[WhatsApp] Error processing message:', error);
    return res.status(200).json({ received: true, error: 'Processing failed' });
  }
}

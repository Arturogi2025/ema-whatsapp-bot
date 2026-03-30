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
    const { parseWebhookPayload, verifyWebhookSignature, sendTextMessage, sendImageMessage, markAsRead } = require('../../lib/whatsapp');
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

    console.log(`[WhatsApp] Message from ${message.from}: "${message.text}"`);
    markAsRead(message.messageId).catch(() => {});

    const conversation = await getOrCreateConversation(message.from, message.name);
    if (conversation.status === 'closed') {
      return res.status(200).json({ received: true });
    }

    await saveMessage(conversation.id, 'user', message.text);
    const history = await getConversationHistory(conversation.id, 20);

    const aiResponse = await handleAIConversation(
      message.text,
      history.filter((m: any) => m.role !== 'system'),
      conversation.message_count
    );

    await saveMessage(conversation.id, 'assistant', aiResponse.text);
    await sendTextMessage(message.from, aiResponse.text);

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

    if (aiResponse.detectedProjectType || aiResponse.intent === 'confirm_schedule') {
      await upsertLead({
        conversationId: conversation.id,
        name: message.name || undefined,
        phone: message.from,
        projectType: aiResponse.detectedProjectType || undefined,
        preferredDatetime: aiResponse.detectedDatetime || undefined,
        status: aiResponse.intent === 'confirm_schedule' ? 'scheduled' : 'contacted',
      });
    }

    if (aiResponse.intent === 'confirm_schedule' && aiResponse.detectedDatetime) {
      await markAsScheduled(conversation.id, aiResponse.detectedDatetime);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[WhatsApp] Error processing message:', error);
    return res.status(200).json({ received: true, error: 'Processing failed' });
  }
}

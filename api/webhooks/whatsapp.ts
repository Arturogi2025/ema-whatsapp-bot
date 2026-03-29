import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parseWebhookPayload, verifyWebhookSignature, sendTextMessage, sendImageMessage, markAsRead } from '../lib/whatsapp';
import { getOrCreateConversation, getConversationHistory, saveMessage, upsertLead, markAsScheduled } from '../lib/conversation';
import { handleAIConversation } from '../lib/ai-handler';
import { getRelevantExamples } from '../lib/portfolio';

/**
 * WhatsApp Business Cloud API Webhook
 *
 * GET  — Meta webhook verification (subscribe)
 * POST — Incoming messages from WhatsApp
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // ── GET: Webhook verification ──────────────────────────────
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

  // ── POST: Incoming messages ────────────────────────────────
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Always respond 200 quickly to Meta (they retry on timeouts)
  // We process in the same request but catch all errors
  try {
    // Verify signature
    const rawBody = JSON.stringify(req.body);
    if (!verifyWebhookSignature(req, rawBody)) {
      console.error('[WhatsApp] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse the incoming message
    const message = parseWebhookPayload(req.body);

    // Not a text message (could be status update, image, etc.) — acknowledge
    if (!message) {
      return res.status(200).json({ received: true });
    }

    console.log(`[WhatsApp] Message from ${message.from}: "${message.text}"`);

    // Mark as read (blue checkmarks) — fire and forget
    markAsRead(message.messageId).catch(() => {});

    // ── 1. Get or create conversation ──────────────────────
    const conversation = await getOrCreateConversation(
      message.from,
      message.name
    );

    // Skip if conversation is already closed
    if (conversation.status === 'closed') {
      console.log(`[WhatsApp] Conversation ${conversation.id} is closed, skipping`);
      return res.status(200).json({ received: true });
    }

    // ── 2. Save user message ───────────────────────────────
    await saveMessage(conversation.id, 'user', message.text);

    // ── 3. Load conversation history ───────────────────────
    const history = await getConversationHistory(conversation.id, 20);

    // ── 4. Get AI response ─────────────────────────────────
    const aiResponse = await handleAIConversation(
      message.text,
      history.filter((m): m is { role: 'user' | 'assistant'; content: string } => m.role !== 'system'),
      conversation.message_count
    );

    // ── 5. Save AI response ────────────────────────────────
    await saveMessage(conversation.id, 'assistant', aiResponse.text);

    // ── 6. Send AI text response via WhatsApp ──────────────
    await sendTextMessage(message.from, aiResponse.text);

    // ── 7. Send portfolio examples if detected ─────────────
    if (aiResponse.shouldSendPortfolio && aiResponse.detectedProjectType) {
      const examples = await getRelevantExamples(
        aiResponse.detectedProjectType,
        3
      );

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

    // ── 8. Update lead data if relevant ────────────────────
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

    // ── 9. Mark as scheduled if appointment confirmed ──────
    if (aiResponse.intent === 'confirm_schedule' && aiResponse.detectedDatetime) {
      await markAsScheduled(conversation.id, aiResponse.detectedDatetime);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[WhatsApp] Error processing message:', error);
    // Still return 200 to prevent Meta from retrying
    return res.status(200).json({ received: true, error: 'Processing failed' });
  }
}

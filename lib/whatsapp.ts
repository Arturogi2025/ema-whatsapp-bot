import crypto from 'crypto';
import type { VercelRequest } from '@vercel/node';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';

interface WhatsAppMessage {
  from: string;
  name: string;
  text: string;
  messageId: string;
  timestamp: string;
}

interface WhatsAppWebhookEntry {
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: { phone_number_id: string };
      contacts?: Array<{ profile: { name: string }; wa_id: string }>;
      messages?: Array<{
        id: string;
        from: string;
        timestamp: string;
        type: string;
        text?: { body: string };
      }>;
      statuses?: Array<{
        id: string;
        status: string;
        timestamp: string;
        recipient_id: string;
      }>;
    };
  }>;
}

/**
 * Parse incoming WhatsApp webhook payload.
 * Returns null for status updates or non-text messages.
 */
export function parseWebhookPayload(body: any): WhatsAppMessage | null {
  if (body?.object !== 'whatsapp_business_account') return null;

  const entry = body.entry?.[0] as WhatsAppWebhookEntry | undefined;
  const change = entry?.changes?.[0];
  if (!change) return null;

  const { contacts, messages } = change.value;

  // Skip status updates (delivered, read, etc.)
  if (!messages || messages.length === 0) return null;

  const msg = messages[0];

  // Only handle text messages for now
  if (msg.type !== 'text' || !msg.text?.body) return null;

  return {
    from: msg.from,
    name: contacts?.[0]?.profile?.name || '',
    text: msg.text.body,
    messageId: msg.id,
    timestamp: msg.timestamp,
  };
}

/**
 * Verify Meta webhook signature (X-Hub-Signature-256 header).
 */
export function verifyWebhookSignature(req: VercelRequest, rawBody: string): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.warn('[WhatsApp] WHATSAPP_APP_SECRET not set, skipping signature verification');
    return true;
  }

  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  if (!signature) return false;

  const expectedSignature = 'sha256=' +
    crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Send a text message via WhatsApp Cloud API.
 */
export async function sendTextMessage(to: string, text: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  const response = await fetch(
    `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: true, body: text },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error('[WhatsApp] Send text failed:', err);
    throw new Error(`WhatsApp API error: ${response.status}`);
  }
}

/**
 * Send an image message with caption via WhatsApp Cloud API.
 * Used to send portfolio examples.
 */
export async function sendImageMessage(
  to: string,
  imageUrl: string,
  caption: string
): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  const response = await fetch(
    `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'image',
        image: { link: imageUrl, caption },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error('[WhatsApp] Send image failed:', err);
    throw new Error(`WhatsApp API error: ${response.status}`);
  }
}

/**
 * Mark a message as read (blue checkmarks).
 */
export async function markAsRead(messageId: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  await fetch(
    `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    }
  );
}

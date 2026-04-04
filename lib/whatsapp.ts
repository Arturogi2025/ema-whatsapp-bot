import crypto from 'crypto';
import type { VercelRequest } from '@vercel/node';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';

export type MediaType = 'text' | 'image' | 'audio' | 'video' | 'sticker' | 'document' | 'location' | 'contacts' | 'reaction' | 'unknown';

interface WhatsAppMessage {
  from: string;
  name: string;
  text: string;
  messageId: string;
  timestamp: string;
  mediaType: MediaType;
  mediaId?: string;
  mediaCaption?: string;
  mediaMimeType?: string;
  mediaFilename?: string;
  locationLatitude?: number;
  locationLongitude?: number;
  locationName?: string;
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
        image?: { id: string; mime_type: string; caption?: string };
        audio?: { id: string; mime_type: string };
        video?: { id: string; mime_type: string; caption?: string };
        sticker?: { id: string; mime_type: string };
        document?: { id: string; mime_type: string; filename?: string; caption?: string };
        location?: { latitude: number; longitude: number; name?: string; address?: string };
        contacts?: Array<{ name: { formatted_name: string }; phones?: Array<{ phone: string }> }>;
        reaction?: { message_id: string; emoji: string };
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

const MEDIA_LABELS: Record<MediaType, string> = {
  text: '',
  image: '📷 Imagen',
  audio: '🎤 Audio',
  video: '🎬 Video',
  sticker: '🏷️ Sticker',
  document: '📄 Documento',
  location: '📍 Ubicación',
  contacts: '👤 Contacto',
  reaction: '😀 Reacción',
  unknown: '📎 Archivo',
};

/**
 * Get a human-readable label for a media type
 */
export function getMediaLabel(type: MediaType): string {
  return MEDIA_LABELS[type] || MEDIA_LABELS.unknown;
}

/**
 * Parse incoming WhatsApp webhook payload.
 * Now handles all message types, not just text.
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
  const contactName = contacts?.[0]?.profile?.name || '';

  const base = {
    from: msg.from,
    name: contactName,
    messageId: msg.id,
    timestamp: msg.timestamp,
  };

  switch (msg.type) {
    case 'text':
      if (!msg.text?.body) return null;
      return { ...base, text: msg.text.body, mediaType: 'text' };

    case 'image':
      return {
        ...base,
        text: msg.image?.caption || '[📷 Imagen]',
        mediaType: 'image',
        mediaId: msg.image?.id,
        mediaCaption: msg.image?.caption,
        mediaMimeType: msg.image?.mime_type,
      };

    case 'audio':
      return {
        ...base,
        text: '[🎤 Audio]',
        mediaType: 'audio',
        mediaId: msg.audio?.id,
        mediaMimeType: msg.audio?.mime_type,
      };

    case 'video':
      return {
        ...base,
        text: msg.video?.caption || '[🎬 Video]',
        mediaType: 'video',
        mediaId: msg.video?.id,
        mediaCaption: msg.video?.caption,
        mediaMimeType: msg.video?.mime_type,
      };

    case 'sticker':
      return {
        ...base,
        text: '[🏷️ Sticker]',
        mediaType: 'sticker',
        mediaId: msg.sticker?.id,
        mediaMimeType: msg.sticker?.mime_type,
      };

    case 'document':
      return {
        ...base,
        text: msg.document?.caption || `[📄 ${msg.document?.filename || 'Documento'}]`,
        mediaType: 'document',
        mediaId: msg.document?.id,
        mediaCaption: msg.document?.caption,
        mediaMimeType: msg.document?.mime_type,
        mediaFilename: msg.document?.filename,
      };

    case 'location':
      return {
        ...base,
        text: `[📍 Ubicación: ${msg.location?.name || msg.location?.address || `${msg.location?.latitude}, ${msg.location?.longitude}`}]`,
        mediaType: 'location',
        locationLatitude: msg.location?.latitude,
        locationLongitude: msg.location?.longitude,
        locationName: msg.location?.name || msg.location?.address,
      };

    case 'contacts':
      const contactInfo = msg.contacts?.[0];
      return {
        ...base,
        text: `[👤 Contacto: ${contactInfo?.name?.formatted_name || 'Sin nombre'}${contactInfo?.phones?.[0]?.phone ? ' - ' + contactInfo.phones[0].phone : ''}]`,
        mediaType: 'contacts',
      };

    case 'reaction':
      return {
        ...base,
        text: `[${msg.reaction?.emoji || '😀'} Reacción]`,
        mediaType: 'reaction',
      };

    default:
      // Handle unknown types gracefully
      return {
        ...base,
        text: `[📎 ${msg.type || 'Mensaje'}]`,
        mediaType: 'unknown',
      };
  }
}

/**
 * Get the download URL for a media file
 */
export async function getMediaUrl(mediaId: string): Promise<string | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  try {
    const res = await fetch(`${WHATSAPP_API_URL}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url || null;
  } catch {
    return null;
  }
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
 * Send a document via WhatsApp Cloud API.
 */
export async function sendDocumentMessage(
  to: string,
  documentUrl: string,
  filename: string,
  caption?: string
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
        type: 'document',
        document: { link: documentUrl, filename, caption },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error('[WhatsApp] Send document failed:', err);
    throw new Error(`WhatsApp API error: ${response.status}`);
  }
}

/**
 * Mark a message as read (blue checkmarks).
 */
/**
 * Send a contact card (vCard) via WhatsApp
 */
export async function sendContactCard(
  to: string,
  contactName: string,
  contactPhone: string,
  orgName: string = 'Bolt'
): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  const [firstName, ...rest] = contactName.split(' ');
  const lastName = rest.join(' ') || '';

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
        to,
        type: 'contacts',
        contacts: [
          {
            name: {
              formatted_name: contactName,
              first_name: firstName,
              last_name: lastName,
            },
            phones: [
              {
                phone: contactPhone,
                type: 'WORK',
                wa_id: contactPhone.replace(/\D/g, ''),
              },
            ],
            org: { company: orgName },
          },
        ],
      }),
    }
  );
}

/**
 * Send a template message via WhatsApp Cloud API.
 * Used when the 24-hour messaging window has expired.
 */
export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string = 'es_MX',
  components?: Array<{
    type: 'header' | 'body' | 'button';
    parameters?: Array<{ type: 'text'; text: string } | { type: 'image'; image: { link: string } }>;
    sub_type?: string;
    index?: number;
  }>
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  const templatePayload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
    },
  };

  if (components && components.length > 0) {
    templatePayload.template.components = components;
  }

  const response = await fetch(
    `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(templatePayload),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error('[WhatsApp] Send template failed:', err);
    return { ok: false, error: err };
  }

  return { ok: true };
}

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

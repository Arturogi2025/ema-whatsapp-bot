// Push notification sender (server-side)
// Uses web-push to send notifications to subscribed browsers/PWAs

import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Configure VAPID
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY!;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(
    'mailto:hola@boltdevlabs.com',
    VAPID_PUBLIC,
    VAPID_PRIVATE
  );
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Send push notification to ALL subscribed devices
 */
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn('[Push] VAPID keys not configured, skipping push');
    return;
  }

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, keys_p256dh, keys_auth');

  if (error || !subs?.length) {
    console.log('[Push] No subscriptions found');
    return;
  }

  const message = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      const subscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys_p256dh,
          auth: sub.keys_auth,
        },
      };

      try {
        await webpush.sendNotification(subscription, message);
      } catch (err: any) {
        // 410 Gone or 404 = subscription expired, remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`[Push] Removing expired subscription ${sub.id}`);
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error(`[Push] Failed to send to ${sub.id}:`, err.statusCode || err.message);
        }
      }
    })
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;
  console.log(`[Push] Sent to ${sent}/${subs.length} devices`);
}

/**
 * Notify: new WhatsApp message received
 */
export async function pushNewMessage(params: {
  name: string | null;
  phone: string;
  preview: string;
  conversationId: string;
}): Promise<void> {
  const name = params.name || params.phone;
  const body = params.preview.length > 80
    ? params.preview.substring(0, 77) + '...'
    : params.preview;

  await sendPushToAll({
    title: `💬 ${name}`,
    body,
    url: `/conversations/${params.conversationId}`,
  });
}

/**
 * Notify: new lead detected
 */
export async function pushNewLead(params: {
  name: string | null;
  projectType: string | null;
  conversationId: string;
}): Promise<void> {
  const name = params.name || 'Nuevo lead';
  const project = params.projectType || 'proyecto';

  await sendPushToAll({
    title: `🔔 Nuevo lead: ${name}`,
    body: `Interesado en: ${project}`,
    url: `/conversations/${params.conversationId}`,
  });
}

/**
 * Notify: follow-up failures
 */
export async function pushFollowupFailure(params: {
  count: number;
}): Promise<void> {
  await sendPushToAll({
    title: `⚠️ ${params.count} follow-up(s) fallidos`,
    body: 'Templates no enviados. Revisa el dashboard para dar seguimiento manual.',
    url: '/conversations',
  });
}

/**
 * Notify: call scheduled
 */
export async function pushCallScheduled(params: {
  name: string | null;
  datetime: string;
  conversationId: string;
}): Promise<void> {
  const name = params.name || 'Lead';

  await sendPushToAll({
    title: `📅 Llamada agendada`,
    body: `${name} — ${params.datetime}`,
    url: `/conversations/${params.conversationId}`,
  });
}

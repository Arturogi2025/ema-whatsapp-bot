import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST: Save push subscription
export async function POST(req: NextRequest) {
  try {
    const { subscription } = await req.json();

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }

    // Upsert by endpoint (same browser = same endpoint)
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          endpoint: subscription.endpoint,
          keys_p256dh: subscription.keys.p256dh,
          keys_auth: subscription.keys.auth,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      );

    if (error) {
      console.error('[Push Subscribe] DB error:', error);
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
    }

    console.log('[Push Subscribe] Subscription saved');
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Push Subscribe] Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE: Remove push subscription
export async function DELETE(req: NextRequest) {
  try {
    const { endpoint } = await req.json();

    if (!endpoint) {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
    }

    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);

    console.log('[Push Subscribe] Subscription removed');
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Push Unsubscribe] Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { sendPushToAll } from '@/lib/push-server';

// POST: Send push notification (called internally from webhook)
// Protected by a shared secret to prevent unauthorized access
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const expectedToken = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Use service role key as shared secret for internal API calls
    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();

    if (!payload.title || !payload.body) {
      return NextResponse.json({ error: 'Missing title or body' }, { status: 400 });
    }

    await sendPushToAll(payload);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Push Send] Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

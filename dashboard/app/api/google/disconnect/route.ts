import { NextResponse } from 'next/server';
import { disconnectGoogle } from '@/lib/google-calendar';

export async function POST() {
  try {
    await disconnectGoogle();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Google Disconnect] Error:', error);
    return NextResponse.json({ error: 'Error desconectando' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { isGoogleConnected } from '@/lib/google-calendar';

export async function GET() {
  try {
    const status = await isGoogleConnected();
    return NextResponse.json(status);
  } catch (error) {
    console.error('[Google Status] Error:', error);
    return NextResponse.json({ connected: false });
  }
}

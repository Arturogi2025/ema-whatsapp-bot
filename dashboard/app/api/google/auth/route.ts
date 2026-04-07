import { NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/google-calendar';

export async function GET() {
  try {
    const url = getAuthUrl();
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('[Google Auth] Error:', error);
    return NextResponse.json({ error: 'Error iniciando autenticación' }, { status: 500 });
  }
}

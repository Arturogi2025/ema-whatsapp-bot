import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/google-calendar';

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code');

    if (!code) {
      return NextResponse.redirect(
        new URL('/settings?google=error&reason=no_code', req.url)
      );
    }

    await exchangeCodeForTokens(code);

    return NextResponse.redirect(
      new URL('/settings?google=connected', req.url)
    );
  } catch (error) {
    console.error('[Google Callback] Error:', error);
    return NextResponse.redirect(
      new URL('/settings?google=error', req.url)
    );
  }
}

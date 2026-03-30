import { NextRequest, NextResponse } from 'next/server';

const PASSWORD = process.env.DASHBOARD_PASSWORD || 'Pumas*1208';

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();

    if (password === PASSWORD) {
      const response = NextResponse.json({ ok: true });
      response.cookies.set('bolt_auth', 'ok', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      });
      return response;
    }

    return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Error de servidor' }, { status: 500 });
  }
}

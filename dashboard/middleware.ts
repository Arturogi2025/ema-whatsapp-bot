import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'bolt_auth';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow login page, auth APIs, and Next.js internals
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Check for auth cookie
  const cookie = req.cookies.get(COOKIE_NAME);
  if (cookie?.value === 'ok') {
    return NextResponse.next();
  }

  // Redirect to login with return URL
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('from', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

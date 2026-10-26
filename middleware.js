import { NextResponse } from 'next/server';
import { AUTH_COOKIE, authToken, sameText, sitePassword } from '@/lib/site-auth';

// 모든 페이지·파일 앞에서 입장 쿠키를 확인합니다. 로그인 화면과 그 요청, Next 내부 파일만 예외.
export const config = {
  matcher: ['/((?!login|api/login|_next/static|_next/image|favicon.ico).*)'],
};

export async function middleware(req) {
  const password = sitePassword();
  if (!password) return NextResponse.next();
  const token = req.cookies.get(AUTH_COOKIE)?.value || '';
  if (token && sameText(token, await authToken(password))) return NextResponse.next();
  const url = req.nextUrl.clone();
  const next = req.nextUrl.pathname + req.nextUrl.search;
  url.pathname = '/login';
  url.search = next && next !== '/' ? `?next=${encodeURIComponent(next)}` : '';
  return NextResponse.redirect(url);
}

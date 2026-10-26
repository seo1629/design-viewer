import { NextResponse } from 'next/server';
import { AUTH_COOKIE, AUTH_MAX_AGE, authToken, sameText, sitePassword } from '@/lib/site-auth';

export async function POST(req) {
  const password = sitePassword();
  if (!password) return NextResponse.json({ ok: true });
  let given = '';
  try {
    given = String((await req.json())?.password || '');
  } catch { /* 빈 요청 */ }
  if (!sameText(given, password)) {
    await new Promise((r) => setTimeout(r, 600)); // 마구 넣어 보기를 느리게
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await authToken(password), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: AUTH_MAX_AGE,
  });
  return res;
}

// 나가기: 쿠키를 지웁니다.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}

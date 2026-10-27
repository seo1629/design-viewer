// 사이트 입장 비밀번호. 서버 전용 환경변수 SITE_PASSWORD 에만 둡니다(NEXT_PUBLIC_ 아님).
// 비어 있으면 잠그지 않습니다. 쿠키에는 비밀번호가 아니라 해시만 들어가고,
// 비밀번호를 바꾸면 해시가 달라져 모두 다시 입력해야 합니다.

export const AUTH_COOKIE = 'dv_auth';


export function sitePassword() {
  return String(process.env.SITE_PASSWORD || '');
}

export async function authToken(password) {
  const bytes = new TextEncoder().encode(`design-viewer:${password}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 길이가 같을 때 끝까지 비교해 시간 차이로 맞혀 보는 것을 어렵게 합니다.
export function sameText(a, b) {
  const x = String(a);
  const y = String(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

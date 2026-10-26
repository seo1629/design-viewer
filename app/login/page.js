'use client';

import { useState } from 'react';
import { APP_TITLE } from '@/lib/supabase';

// 같은 사이트 안의 경로로만 돌려보냅니다(다른 사이트로 넘기는 링크 막기).
function safeNext() {
  const v = new URLSearchParams(window.location.search).get('next') || '/';
  return v.startsWith('/') && !v.startsWith('//') ? v : '/';
}

export default function Login() {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.replace(safeNext());
        return;
      }
      setErr('비밀번호가 맞지 않아요.');
      setPassword('');
    } catch {
      setErr('연결이 안 돼요. 잠시 뒤 다시 해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>{APP_TITLE}</h1>
        <p className="login-sub">비밀번호를 넣고 들어와 주세요.</p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          aria-label="비밀번호"
        />
        <button type="submit" className="btn login-go" disabled={busy || !password}>{busy ? '확인 중…' : '들어가기'}</button>
        {err && <p className="login-err" role="alert">{err}</p>}
      </form>
    </main>
  );
}

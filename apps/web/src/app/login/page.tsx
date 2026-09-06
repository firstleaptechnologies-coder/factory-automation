'use client';

import {useState} from 'react';
import {useAuth} from '@/lib/auth';

export default function LoginPage() {
  const {signIn} = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(identifier.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
      setBusy(false);
    }
  };

  return (
    <div className="center-screen">
      <form className="card" style={{width: 360}} onSubmit={submit}>
        <h1 className="page-title">Decor Bucket</h1>
        <p className="page-sub">Manufacturing ERP</p>

        <div className="field">
          <label htmlFor="identifier">Employee code, phone or email</label>
          <input
            id="identifier"
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>

        {error ? <p className="error">{error}</p> : null}

        <button className="primary" style={{width: '100%'}} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

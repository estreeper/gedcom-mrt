import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLicenseStore } from '../../state/LicenseStore';
import '../billing/billing.css';

// Login / signup. The same component serves both via the `mode` prop. Honors a
// `?next=` param so the upsell flow can return the user to where they were.

function useNext(): string {
  const { search } = useLocation();
  const next = new URLSearchParams(search).get('next');
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return '/app';
}

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLicenseStore((s) => s.login);
  const signup = useLicenseStore((s) => s.signup);
  const busy = useLicenseStore((s) => s.busy);
  const error = useLicenseStore((s) => s.error);
  const navigate = useNavigate();
  const next = useNext();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = mode === 'login' ? await login(email, password) : await signup(email, password);
    if (ok) navigate(next, { replace: true });
  };

  const googleHref = `/api/auth/oauth/google?next=${encodeURIComponent(next)}`;
  const isLogin = mode === 'login';

  return (
    <div className="auth-page">
      <h1>{isLogin ? 'Sign in' : 'Create your account'}</h1>

      <form className="auth-form" onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button className="btn-solid" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <div className="divider">or</div>
      <div className="oauth-row">
        <a className="oauth-btn" href={googleHref}>
          Continue with Google
        </a>
      </div>

      <p className="auth-alt">
        {isLogin ? (
          <>
            No account? <Link to={`/signup${window.location.search}`}>Create one</Link>
          </>
        ) : (
          <>
            Already have an account? <Link to={`/login${window.location.search}`}>Sign in</Link>
          </>
        )}
      </p>
    </div>
  );
}

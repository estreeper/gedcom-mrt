import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLicenseStore } from '../../state/LicenseStore';
import { safeNext } from '../safeNext';
import '../billing/billing.css';

// Login / signup. The same component serves both via the `mode` prop. Honors a
// `?next=` param so the upsell flow can return the user to where they were.

function useNext(): string {
  const { search } = useLocation();
  return safeNext(new URLSearchParams(search).get('next'));
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
  // Carry ?next= across the login/signup switch. Read from the router, not
  // window.location, so it is right under any router (and mid-navigation).
  const { search } = useLocation();

  // A failed attempt's message lives in the shared store; don't carry it over
  // to the other form (or back to this one on a later visit).
  useEffect(() => {
    useLicenseStore.setState({ error: undefined });
  }, [mode]);

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
            No account? <Link to={`/signup${search}`}>Create one</Link>
          </>
        ) : (
          <>
            Already have an account? <Link to={`/login${search}`}>Sign in</Link>
          </>
        )}
      </p>
    </div>
  );
}

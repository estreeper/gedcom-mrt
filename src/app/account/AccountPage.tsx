import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLicenseStore, isLicensed } from '../../state/LicenseStore';
import '../billing/billing.css';

// Account overview: email, license status, and actions (buy/renew, logout).

function formatDate(ts: number | null | undefined): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString();
  } catch {
    return '—';
  }
}

export function AccountPage() {
  const authState = useLicenseStore((s) => s.authState);
  const user = useLicenseStore((s) => s.user);
  const license = useLicenseStore((s) => s.license);
  const logout = useLicenseStore((s) => s.logout);
  const licensed = useLicenseStore((s) => isLicensed(s));
  const navigate = useNavigate();

  // Once we know the visitor is signed out, send them to sign in.
  useEffect(() => {
    if (authState === 'anonymous') navigate('/login?next=/account', { replace: true });
  }, [authState, navigate]);

  if (authState !== 'user' || !user) {
    return (
      <div className="account-page">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="account-page">
      <h1>Your account</h1>

      <div className="account-row">
        <span>Email</span>
        <strong>{user.email}</strong>
      </div>
      <div className="account-row">
        <span>License</span>
        <span className={`badge-license ${licensed ? 'active' : 'inactive'}`}>
          {licensed
            ? 'Active'
            : license?.status === 'expired'
              ? 'Expired'
              : license?.status === 'refunded'
                ? 'Refunded'
                : 'None'}
        </span>
      </div>
      {licensed && (
        <div className="account-row">
          <span>Access until</span>
          <strong>{formatDate(license?.expiresAt)}</strong>
        </div>
      )}

      <div className="account-actions">
        {licensed ? (
          <Link className="btn-solid" to="/account/billing">
            Manage / renew
          </Link>
        ) : (
          <Link className="btn-solid" to="/account/billing">
            Get a license — $35
          </Link>
        )}
        <button onClick={() => logout().then(() => navigate('/'))}>Sign out</button>
      </div>

      <p className="auth-alt">
        <Link to="/app">← Back to the app</Link>
      </p>
    </div>
  );
}

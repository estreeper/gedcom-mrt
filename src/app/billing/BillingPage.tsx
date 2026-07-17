import React, { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLicenseStore, isLicensed } from '../../state/LicenseStore';
import './billing.css';

// Purchase / renew page. Starts a Stripe Checkout redirect.

export function BillingPage() {
  const authState = useLicenseStore((s) => s.authState);
  const busy = useLicenseStore((s) => s.busy);
  const error = useLicenseStore((s) => s.error);
  const startCheckout = useLicenseStore((s) => s.startCheckout);
  const licensed = useLicenseStore((s) => isLicensed(s));
  const navigate = useNavigate();
  const canceled = new URLSearchParams(useLocation().search).get('canceled');

  useEffect(() => {
    if (authState === 'anonymous')
      navigate('/login?next=/account/billing', { replace: true });
  }, [authState, navigate]);

  return (
    <div className="account-page">
      <h1>{licensed ? 'Renew your license' : 'Get a license'}</h1>
      <p className="modal-lead">
        A one-time payment of <strong>$35</strong> grants a full year of access to
        applying repairs, manual editing, exporting, and encrypted cloud storage.
      </p>
      {canceled && (
        <p className="auth-error">Checkout was canceled — you can try again anytime.</p>
      )}
      {error && <p className="auth-error">{error}</p>}
      <button className="btn-solid" disabled={busy} onClick={() => startCheckout()}>
        {busy ? 'Redirecting…' : licensed ? 'Add another year — $35' : 'Buy for $35'}
      </button>
      <p className="modal-fine">30-day money-back guarantee.</p>
      <p className="auth-alt">
        <Link to="/account">← Back to your account</Link>
      </p>
    </div>
  );
}

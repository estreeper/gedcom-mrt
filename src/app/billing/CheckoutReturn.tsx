import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLicenseStore, isLicensed } from '../../state/LicenseStore';
import './billing.css';

// Landed here after Stripe Checkout. The webhook is the source of truth for
// granting the license, so we re-fetch /license a few times (it may lag the
// redirect by a moment) and then continue into the app.

const MAX_TRIES = 6;

export function CheckoutReturn() {
  const refresh = useLicenseStore((s) => s.refresh);
  const navigate = useNavigate();
  const [status, setStatus] = useState<'checking' | 'done' | 'pending'>('checking');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode dedupe
    started.current = true;

    let cancelled = false;
    (async () => {
      for (let i = 0; i < MAX_TRIES; i++) {
        await refresh();
        if (cancelled) return;
        if (isLicensed()) {
          setStatus('done');
          setTimeout(() => navigate('/app', { replace: true }), 800);
          return;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (!cancelled) setStatus('pending');
    })();

    return () => {
      cancelled = true;
    };
  }, [refresh, navigate]);

  return (
    <div className="account-page">
      <h1>
        {status === 'done'
          ? 'You’re all set 🎉'
          : status === 'pending'
            ? 'Almost there…'
            : 'Confirming your purchase…'}
      </h1>
      <p className="modal-lead">
        {status === 'done'
          ? 'Your license is active. Taking you back to the app…'
          : status === 'pending'
            ? 'Your payment went through. Your license should activate momentarily — refresh your account page in a minute if it hasn’t.'
            : 'Hang tight while we confirm your license.'}
      </p>
    </div>
  );
}

import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUpsellStore } from '../../state/UpsellStore';
import { useLicenseStore } from '../../state/LicenseStore';
import './billing.css';

// The paywall shown when an unlicensed user tries to apply a repair, export, or
// use cloud storage. The gate is opened from the store seam via setUpsellHandler.

const REASON_COPY: Record<string, string> = {
  apply: 'Applying repairs',
  export: 'Exporting the repaired file',
  cloud: 'Encrypted cloud storage',
};

export function UpsellModal() {
  const { open, reason, close } = useUpsellStore();
  const authState = useLicenseStore((s) => s.authState);
  const busy = useLicenseStore((s) => s.busy);
  const startCheckout = useLicenseStore((s) => s.startCheckout);
  const navigate = useNavigate();
  const location = useLocation();

  if (!open) return null;

  const what = (reason && REASON_COPY[reason]) || 'This feature';
  const next = encodeURIComponent(location.pathname + location.search);

  const goSignup = () => {
    close();
    navigate(`/signup?next=${next}`);
  };

  return (
    <div className="modal-overlay" role="dialog" aria-label="Upgrade to apply repairs">
      <div className="modal-card">
        <button className="modal-close" aria-label="Close" onClick={close}>
          ×
        </button>
        <h2>Unlock repairs</h2>
        <p className="modal-lead">
          {what} needs a license. Checking your file and previewing every fix is
          free — a license unlocks applying them and exporting the result.
        </p>
        <div className="modal-price">
          <strong>$35</strong> one-time · one year of access
        </div>
        <ul className="modal-list">
          <li>Apply single &amp; bulk repairs</li>
          <li>Edit records by hand and save</li>
          <li>Export the repaired GEDCOM</li>
          <li>Optional zero-knowledge cloud storage</li>
        </ul>

        {authState === 'user' ? (
          <button className="btn-solid" disabled={busy} onClick={() => startCheckout()}>
            {busy ? 'Redirecting…' : 'Unlock for $35'}
          </button>
        ) : (
          <button className="btn-solid" onClick={goSignup}>
            Create an account to unlock
          </button>
        )}
        <p className="modal-fine">30-day money-back guarantee.</p>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { useCloudKeyStore } from '../../state/CloudKeyStore';
import '../billing/billing.css';

// Sets up or unlocks the zero-knowledge encryption passphrase for cloud storage.
// The DEK it produces lives only in memory (CloudKeyStore). Shows the one-time
// recovery key after first-time setup.

export function UnlockDialog({ onClose }: { onClose: () => void }) {
  const {
    status,
    busy,
    error,
    recoveryKeyOnce,
    probe,
    setup,
    unlock,
    recover,
    dismissRecoveryKey,
  } = useCloudKeyStore();
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [localErr, setLocalErr] = useState<string>();

  useEffect(() => {
    void probe();
  }, [probe]);

  // After unlocking successfully (and no recovery key to show), close.
  useEffect(() => {
    if (status === 'unlocked' && !recoveryKeyOnce) onClose();
  }, [status, recoveryKeyOnce, onClose]);

  const submitSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalErr(undefined);
    if (passphrase.length < 8) return setLocalErr('Use at least 8 characters.');
    if (passphrase !== confirm) return setLocalErr('Passphrases do not match.');
    await setup(passphrase);
  };

  const submitUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (useRecovery) await recover(recoveryKey, passphrase);
    else await unlock(passphrase);
  };

  return (
    <div className="modal-overlay" role="dialog" aria-label="Cloud storage passphrase">
      <div className="modal-card">
        <button className="modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>

        {recoveryKeyOnce ? (
          <>
            <h2>Save your recovery key</h2>
            <p className="modal-lead">
              This is the <strong>only</strong> way to recover your encrypted files
              if you forget your passphrase. We can’t recover it for you — store it
              somewhere safe.
            </p>
            <pre className="recovery-key">{recoveryKeyOnce}</pre>
            <button
              className="btn-solid"
              onClick={() => {
                dismissRecoveryKey();
                onClose();
              }}
            >
              I’ve saved it
            </button>
          </>
        ) : status === 'no-envelope' ? (
          <>
            <h2>Set up cloud storage</h2>
            <p className="modal-lead">
              Choose an encryption passphrase. Your files are encrypted on this
              device with it before upload — we only ever store ciphertext. The
              passphrase is separate from your login and never leaves your browser.
            </p>
            <form className="auth-form" onSubmit={submitSetup}>
              <label>
                Encryption passphrase
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <label>
                Confirm passphrase
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              {(localErr || error) && <p className="auth-error">{localErr || error}</p>}
              <button className="btn-solid" type="submit" disabled={busy}>
                {busy ? 'Setting up…' : 'Enable cloud storage'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h2>Unlock cloud storage</h2>
            <p className="modal-lead">
              Enter your encryption passphrase to decrypt your files on this device.
            </p>
            <form className="auth-form" onSubmit={submitUnlock}>
              {useRecovery && (
                <label>
                  Recovery key
                  <input
                    value={recoveryKey}
                    onChange={(e) => setRecoveryKey(e.target.value)}
                    placeholder="XXXXX-XXXXX-…"
                  />
                </label>
              )}
              <label>
                {useRecovery ? 'New passphrase' : 'Passphrase'}
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  autoComplete={useRecovery ? 'new-password' : 'current-password'}
                />
              </label>
              {error && <p className="auth-error">{error}</p>}
              <button className="btn-solid" type="submit" disabled={busy}>
                {busy ? 'Unlocking…' : useRecovery ? 'Recover & set passphrase' : 'Unlock'}
              </button>
            </form>
            <p className="auth-alt">
              <button className="linklike" onClick={() => setUseRecovery((v) => !v)}>
                {useRecovery ? 'Use passphrase instead' : 'Forgot passphrase? Use recovery key'}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

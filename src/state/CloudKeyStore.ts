import { create } from 'zustand';
import {
  KeyEnvelope,
  createEnvelope,
  unlockWithPassphrase,
  unlockWithRecovery,
  rewrapPassphrase,
} from '../lib/crypto/keys';
import { getKeyEnvelope, putKeyEnvelope } from '../lib/cloud';

// Holds the unwrapped Data Encryption Key IN MEMORY ONLY. It is NEVER persisted
// (no localStorage / IndexedDB) so the zero-knowledge guarantee holds — a reload
// requires re-entering the passphrase. Cleared on logout.

type Status = 'unknown' | 'no-envelope' | 'locked' | 'unlocked';

interface CloudKeyStore {
  status: Status;
  dek?: CryptoKey;
  /** Shown exactly once, right after setup. */
  recoveryKeyOnce?: string;
  busy: boolean;
  error?: string;

  /** Determine whether the user has an envelope yet (locked vs first-time setup). */
  probe(): Promise<void>;
  /** First-time setup: create + upload an envelope; returns the recovery key. */
  setup(passphrase: string): Promise<boolean>;
  unlock(passphrase: string): Promise<boolean>;
  recover(recoveryKey: string, newPassphrase: string): Promise<boolean>;
  dismissRecoveryKey(): void;
  lock(): void;
}

export const useCloudKeyStore = create<CloudKeyStore>((set, get) => ({
  status: 'unknown',
  busy: false,

  async probe() {
    if (get().status === 'unlocked') return;
    try {
      const envelope = await getKeyEnvelope();
      set({ status: envelope ? 'locked' : 'no-envelope', error: undefined });
    } catch (err) {
      set({ error: msg(err) });
    }
  },

  async setup(passphrase) {
    set({ busy: true, error: undefined });
    try {
      const { dek, envelope, recoveryKey } = await createEnvelope(passphrase);
      await putKeyEnvelope(envelope);
      set({ status: 'unlocked', dek, recoveryKeyOnce: recoveryKey, busy: false });
      return true;
    } catch (err) {
      set({ busy: false, error: msg(err) });
      return false;
    }
  },

  async unlock(passphrase) {
    set({ busy: true, error: undefined });
    try {
      const envelope = await getKeyEnvelope();
      if (!envelope) {
        set({ busy: false, status: 'no-envelope' });
        return false;
      }
      const dek = await unlockWithPassphrase(envelope, passphrase);
      if (!dek) {
        set({ busy: false, error: 'Incorrect passphrase.' });
        return false;
      }
      set({ status: 'unlocked', dek, busy: false });
      return true;
    } catch (err) {
      set({ busy: false, error: msg(err) });
      return false;
    }
  },

  async recover(recoveryKey, newPassphrase) {
    set({ busy: true, error: undefined });
    try {
      const envelope = await getKeyEnvelope();
      if (!envelope) {
        set({ busy: false, status: 'no-envelope' });
        return false;
      }
      const dek = await unlockWithRecovery(envelope, recoveryKey);
      if (!dek) {
        set({ busy: false, error: 'That recovery key did not work.' });
        return false;
      }
      // Set the new passphrase, keeping the same recovery key.
      const next = await rewrapPassphrase(dek, newPassphrase, envelope.recovery);
      await putKeyEnvelope(next);
      set({ status: 'unlocked', dek, busy: false });
      return true;
    } catch (err) {
      set({ busy: false, error: msg(err) });
      return false;
    }
  },

  dismissRecoveryKey() {
    set({ recoveryKeyOnce: undefined });
  },

  lock() {
    set({ status: 'unknown', dek: undefined, recoveryKeyOnce: undefined });
  },
}));

function msg(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.';
}

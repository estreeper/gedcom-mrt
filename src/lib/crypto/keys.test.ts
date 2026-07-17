import { describe, it, expect } from 'vitest';
import {
  createEnvelope,
  unlockWithPassphrase,
  unlockWithRecovery,
  rewrapPassphrase,
  encryptText,
  decryptText,
  encryptToBase64,
  decryptFromBase64,
} from './keys';

// These exercise the real Web Crypto (node's global crypto.subtle under vitest).

describe('key envelope', () => {
  const PASS = 'correct horse battery staple';
  const GED = '0 HEAD\n1 SOUR TEST\n0 @I1@ INDI\n1 NAME John /Smith/\n0 TRLR\n';

  it('encrypts and decrypts text with the DEK', async () => {
    const { dek } = await createEnvelope(PASS);
    const blob = await encryptText(dek, GED);
    expect(new TextDecoder().decode(blob)).not.toContain('John'); // ciphertext
    expect(await decryptText(dek, blob)).toBe(GED);
  });

  it('unlocks the DEK from the passphrase and decrypts earlier ciphertext', async () => {
    const { dek, envelope } = await createEnvelope(PASS);
    const blob = await encryptText(dek, GED);

    const unlocked = await unlockWithPassphrase(envelope, PASS);
    expect(unlocked).not.toBeNull();
    expect(await decryptText(unlocked!, blob)).toBe(GED);
  });

  it('rejects the wrong passphrase', async () => {
    const { envelope } = await createEnvelope(PASS);
    expect(await unlockWithPassphrase(envelope, 'wrong passphrase')).toBeNull();
  });

  it('unlocks with the recovery key and can re-wrap under a new passphrase', async () => {
    const { dek, envelope, recoveryKey } = await createEnvelope(PASS);
    const blob = await encryptText(dek, GED);

    const recovered = await unlockWithRecovery(envelope, recoveryKey);
    expect(recovered).not.toBeNull();
    expect(await decryptText(recovered!, blob)).toBe(GED);

    // Set a new passphrase; the old one no longer works, the new one does.
    const next = await rewrapPassphrase(recovered!, 'a brand new passphrase', envelope.recovery);
    expect(await unlockWithPassphrase(next, PASS)).toBeNull();
    const withNew = await unlockWithPassphrase(next, 'a brand new passphrase');
    expect(await decryptText(withNew!, blob)).toBe(GED);
  });

  it('round-trips a short string via base64 (for filenames)', async () => {
    const { dek } = await createEnvelope(PASS);
    const enc = await encryptToBase64(dek, 'family-tree.ged');
    expect(await decryptFromBase64(dek, enc)).toBe('family-tree.ged');
  });

  it('produces envelopes that leak no plaintext', async () => {
    const { envelope } = await createEnvelope(PASS);
    const json = JSON.stringify(envelope);
    expect(json).not.toContain(PASS);
    // Only base64 wrapped material + params are present.
    expect(Object.keys(envelope)).toEqual(['v', 'passphrase', 'recovery']);
  });
});

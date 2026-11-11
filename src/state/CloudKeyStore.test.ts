import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCloudKeyStore } from './CloudKeyStore';
import { decryptText, encryptText } from '../lib/crypto/keys';
import { installFakeApi, reply, fail } from '../test/fakeApi';

// The key store against a fake backend that just holds the envelope, with real
// Web Crypto — so "unlocked" here means a DEK that genuinely decrypts.

afterEach(() => vi.unstubAllGlobals());

const store = () => useCloudKeyStore.getState();

/** A backend with no envelope yet; PUT stores it, GET returns it. */
function keybagServer(initial?: string) {
  let envelope = initial;
  const server = installFakeApi({
    'GET /keybag': () => (envelope ? reply({ envelope }) : fail(404, 'No key envelope yet.')),
    'PUT /keybag': (call) => {
      envelope = (call.body as { envelope: string }).envelope;
      return reply({ ok: true });
    },
  });
  return { ...server, envelope: () => envelope };
}

/** Run first-time setup, then lock, leaving an envelope on the "server". */
async function setUpAndLock(passphrase = 'correct horse') {
  const server = keybagServer();
  await store().setup(passphrase);
  const { dek, recoveryKeyOnce } = store();
  const secret = await encryptText(dek!, 'family secrets');
  store().lock();
  return { server, secret, recoveryKey: recoveryKeyOnce! };
}

describe('probe', () => {
  it('reports no-envelope for a first-time user and locked for a returning one', async () => {
    keybagServer();
    await store().probe();
    expect(store().status).toBe('no-envelope');

    keybagServer('{"v":1}');
    await store().probe();
    expect(store().status).toBe('locked');
  });

  it('keeps the status and surfaces the error when the server fails', async () => {
    installFakeApi({ 'GET /keybag': fail(402, 'A license is required for cloud storage.') });
    await store().probe();
    expect(store()).toMatchObject({
      status: 'unknown',
      error: 'A license is required for cloud storage.',
    });
  });

  it('does not re-lock an unlocked store', async () => {
    const server = keybagServer();
    await store().setup('correct horse');
    await store().probe();
    expect(store().status).toBe('unlocked');
    expect(server.callsTo('GET /keybag')).toHaveLength(0);
  });
});

describe('setup', () => {
  it('uploads an envelope, unlocks, and exposes the recovery key once', async () => {
    const server = keybagServer();
    await expect(store().setup('correct horse')).resolves.toBe(true);

    expect(store()).toMatchObject({ status: 'unlocked', busy: false, error: undefined });
    expect(store().recoveryKeyOnce).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/);
    // What reached the server is the wrapped key, never the secrets.
    const sent = server.envelope()!;
    expect(JSON.parse(sent)).toMatchObject({ v: 1, passphrase: {}, recovery: {} });
    expect(sent).not.toContain('correct horse');
    expect(sent).not.toContain(store().recoveryKeyOnce!);

    store().dismissRecoveryKey();
    expect(store().recoveryKeyOnce).toBeUndefined();
    expect(store().status).toBe('unlocked');
  });

  it('stays locked when the envelope cannot be saved', async () => {
    installFakeApi({ 'PUT /keybag': fail(500, 'Storage is down.') });
    await expect(store().setup('correct horse')).resolves.toBe(false);
    expect(store()).toMatchObject({ status: 'unknown', dek: undefined, busy: false, error: 'Storage is down.' });
  });
});

describe('unlock', () => {
  it('recovers the same key with the right passphrase', async () => {
    const { secret } = await setUpAndLock();
    expect(store()).toMatchObject({ status: 'unknown', dek: undefined });

    await expect(store().unlock('correct horse')).resolves.toBe(true);
    expect(store().status).toBe('unlocked');
    expect(store().recoveryKeyOnce).toBeUndefined();
    expect(await decryptText(store().dek!, secret)).toBe('family secrets');
  });

  it('rejects the wrong passphrase and stays locked', async () => {
    await setUpAndLock();
    await expect(store().unlock('wrong horse')).resolves.toBe(false);
    expect(store()).toMatchObject({ dek: undefined, busy: false, error: 'Incorrect passphrase.' });
    expect(store().status).not.toBe('unlocked');
  });

  it('switches to setup when there is no envelope to unlock', async () => {
    keybagServer();
    await expect(store().unlock('anything')).resolves.toBe(false);
    expect(store()).toMatchObject({ status: 'no-envelope', busy: false });
  });

  it('surfaces a server failure', async () => {
    installFakeApi({ 'GET /keybag': fail(500, 'boom') });
    await expect(store().unlock('anything')).resolves.toBe(false);
    expect(store()).toMatchObject({ busy: false, error: 'boom' });
  });
});

describe('recover', () => {
  it('unlocks with the recovery key and switches to the new passphrase', async () => {
    const { server, secret, recoveryKey } = await setUpAndLock('forgotten');
    const before = server.envelope()!;

    // Typed back in lower case with stray spaces, as a person would.
    await expect(store().recover(`  ${recoveryKey.toLowerCase()} `, 'brand new pass')).resolves.toBe(true);
    expect(await decryptText(store().dek!, secret)).toBe('family secrets');

    // The stored envelope changed its passphrase wrap but kept the recovery one.
    const after = JSON.parse(server.envelope()!);
    expect(after.recovery).toEqual(JSON.parse(before).recovery);
    expect(after.passphrase).not.toEqual(JSON.parse(before).passphrase);

    store().lock();
    await expect(store().unlock('forgotten')).resolves.toBe(false);
    await expect(store().unlock('brand new pass')).resolves.toBe(true);
    expect(await decryptText(store().dek!, secret)).toBe('family secrets');
  });

  it('rejects a wrong recovery key without touching the stored envelope', async () => {
    const { server } = await setUpAndLock();
    const before = server.envelope();
    await expect(store().recover('AAAAA-AAAAA-AAAAA-AAAAA', 'new pass')).resolves.toBe(false);
    expect(store()).toMatchObject({ dek: undefined, error: 'That recovery key did not work.' });
    expect(server.envelope()).toBe(before);
    expect(server.callsTo('PUT /keybag')).toHaveLength(1); // only the original setup
  });

  it('switches to setup when there is no envelope', async () => {
    keybagServer();
    await expect(store().recover('AAAAA-AAAAA-AAAAA-AAAAA', 'new pass')).resolves.toBe(false);
    expect(store().status).toBe('no-envelope');
  });

  it('does not unlock if the new envelope cannot be saved', async () => {
    const { server, recoveryKey } = await setUpAndLock();
    server.on('PUT /keybag', fail(500, 'Storage is down.'));
    await expect(store().recover(recoveryKey, 'new pass')).resolves.toBe(false);
    expect(store()).toMatchObject({ dek: undefined, error: 'Storage is down.' });
    expect(store().status).not.toBe('unlocked');
  });
});

describe('lock', () => {
  it('forgets the key and any undisplayed recovery key', async () => {
    keybagServer();
    await store().setup('correct horse');
    store().lock();
    expect(store()).toMatchObject({ status: 'unknown', dek: undefined, recoveryKeyOnce: undefined });
  });
});

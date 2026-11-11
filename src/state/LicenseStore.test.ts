import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useLicenseStore,
  isLicensed,
  isKnownUnlicensed,
  canApplyRepairs,
} from './LicenseStore';
import { useCloudKeyStore } from './CloudKeyStore';
import { installFakeApi, reply, fail } from '../test/fakeApi';

afterEach(() => vi.unstubAllGlobals());

const USER = { id: 'u1', email: 'pat@example.com' };
const ACTIVE = { status: 'active', plan: 'annual', expiresAt: 4102444800000 } as const;
const NONE = { status: 'none', plan: null, expiresAt: null } as const;
const store = () => useLicenseStore.getState();

describe('license predicates', () => {
  type S = Parameters<typeof isLicensed>[0];
  const s = (partial: object) => ({ ...store(), ...partial }) as S;

  it.each([
    ['session not known yet', { authState: 'unknown' }, false, false],
    ['signed out', { authState: 'anonymous' }, false, true],
    ['signed in, active license', { authState: 'user', license: ACTIVE }, true, false],
    ['signed in, no license', { authState: 'user', license: NONE }, false, true],
    ['signed in, expired', { authState: 'user', license: { ...ACTIVE, status: 'expired' } }, false, true],
    ['signed in, refunded', { authState: 'user', license: { ...ACTIVE, status: 'refunded' } }, false, true],
    ['signed in, license lookup failed', { authState: 'user', license: undefined }, false, false],
  ])('%s', (_name, state, licensed, knownUnlicensed) => {
    expect(isLicensed(s(state))).toBe(licensed);
    expect(isKnownUnlicensed(s(state))).toBe(knownUnlicensed);
    // The gate is soft: it blocks only when we KNOW there's no license.
    expect(canApplyRepairs(s(state))).toBe(!knownUnlicensed);
  });
});

describe('refresh', () => {
  it('loads the user and their license', async () => {
    installFakeApi({ 'GET /auth/me': reply({ user: USER }), 'GET /license': reply(ACTIVE) });
    await store().refresh();
    expect(store()).toMatchObject({ authState: 'user', user: USER, license: ACTIVE });
    expect(isLicensed()).toBe(true);
  });

  it('marks the visitor signed out on a 401', async () => {
    useLicenseStore.setState({ authState: 'user', user: USER, license: ACTIVE });
    installFakeApi({ 'GET /auth/me': fail(401, 'Not signed in.') });
    await store().refresh();
    expect(store()).toMatchObject({ authState: 'anonymous', user: undefined, license: undefined });
    expect(canApplyRepairs()).toBe(false);
  });

  it.each([
    ['the network is down', new TypeError('Failed to fetch')],
    ['the server errors', fail(500, 'boom')],
  ])('leaves the session unknown (gate open) when %s', async (_name, response) => {
    installFakeApi({ 'GET /auth/me': response });
    await store().refresh();
    expect(store().authState).toBe('unknown');
    expect(canApplyRepairs()).toBe(true);
  });

  it('keeps the gate open when the user loads but the license lookup fails', async () => {
    installFakeApi({ 'GET /auth/me': reply({ user: USER }), 'GET /license': fail(500) });
    await store().refresh();
    expect(store()).toMatchObject({ authState: 'user', user: USER, license: undefined });
    expect(canApplyRepairs()).toBe(true);
    expect(isLicensed()).toBe(false);
  });
});

describe.each(['login', 'signup'] as const)('%s', (action) => {
  const path = `POST /auth/${action}`;

  it('signs the user in, loads the license and reports success', async () => {
    const server = installFakeApi({ [path]: reply({ user: USER }), 'GET /license': reply(NONE) });
    await expect(store()[action]('pat@example.com', 'password123')).resolves.toBe(true);
    expect(server.callsTo(path)[0].body).toEqual({ email: 'pat@example.com', password: 'password123' });
    expect(store()).toMatchObject({ authState: 'user', user: USER, license: NONE, busy: false, error: undefined });
  });

  it("reports failure with the server's message and stays signed out", async () => {
    useLicenseStore.setState({ authState: 'anonymous' });
    installFakeApi({ [path]: fail(action === 'login' ? 401 : 409, 'Nope.') });
    await expect(store()[action]('pat@example.com', 'bad')).resolves.toBe(false);
    expect(store()).toMatchObject({ authState: 'anonymous', busy: false, error: 'Nope.' });
  });

  it('shows a generic message when the server cannot be reached', async () => {
    installFakeApi({});
    await expect(store()[action]('pat@example.com', 'password123')).resolves.toBe(false);
    expect(store().error).toBe('Something went wrong. Please try again.');
  });

  it('is busy while the request is in flight and clears a previous error', async () => {
    useLicenseStore.setState({ error: 'old' });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    installFakeApi({
      [path]: async () => {
        await gate;
        return reply({ user: USER });
      },
      'GET /license': reply(NONE),
    });
    const pending = store()[action]('pat@example.com', 'password123');
    expect(store()).toMatchObject({ busy: true, error: undefined });
    release();
    await pending;
    expect(store().busy).toBe(false);
  });
});

describe('logout', () => {
  it('signs out locally even if the server call fails', async () => {
    useLicenseStore.setState({ authState: 'user', user: USER, license: ACTIVE });
    installFakeApi({ 'POST /auth/logout': fail(500) });
    await store().logout();
    expect(store()).toMatchObject({ authState: 'anonymous', user: undefined, license: undefined });
  });

  it("drops the account's cloud encryption key from memory", async () => {
    useLicenseStore.setState({ authState: 'user', user: USER, license: ACTIVE });
    useCloudKeyStore.setState({
      status: 'unlocked',
      dek: {} as CryptoKey,
      recoveryKeyOnce: 'AAAAA-BBBBB',
    });
    installFakeApi({ 'POST /auth/logout': reply({ ok: true }) });
    await store().logout();
    expect(useCloudKeyStore.getState()).toMatchObject({
      status: 'unknown',
      dek: undefined,
      recoveryKeyOnce: undefined,
    });
  });
});

describe('startCheckout', () => {
  it('reports the error and stops being busy when checkout cannot start', async () => {
    installFakeApi({ 'POST /checkout': fail(503, 'Payments are not configured.') });
    await store().startCheckout();
    expect(store()).toMatchObject({ busy: false, error: 'Payments are not configured.' });
  });
});

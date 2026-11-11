import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import { config, assertProdConfig } from '../src/config.js';
import { MemoryStore } from '../src/store/memory.js';
import { MemoryBlobStore, getBlobStore, setBlobStore } from '../src/store/blobs.js';
import { getStore, setStore } from '../src/store/index.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { signSession, verifySession } from '../src/auth/session.js';

const savedConfig = structuredClone(config);
afterEach(() => {
  Object.assign(config, structuredClone(savedConfig));
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('config', () => {
  it('has safe local defaults', () => {
    expect(config).toMatchObject({
      isProd: false,
      dataBackend: 'memory',
      sessionCookie: 'gmrt_session',
      license: { days: 365, priceCents: 3500, currency: 'usd' },
    });
    expect(config.sessionSecret).not.toBe('');
  });

  it('reads overrides from the environment, treating empty as unset', async () => {
    vi.stubEnv('PORT', '9090');
    vi.stubEnv('LICENSE_DAYS', '30');
    vi.stubEnv('HOST', '');
    vi.resetModules();
    const fresh = (await import('../src/config.js')).config;
    expect(fresh.port).toBe(9090);
    expect(fresh.license.days).toBe(30);
    expect(fresh.host).toBe('0.0.0.0');
  });

  it('defaults to Firestore and no session secret in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SESSION_SECRET', '');
    vi.stubEnv('DATA_BACKEND', '');
    vi.resetModules();
    const fresh = await import('../src/config.js');
    expect(fresh.config).toMatchObject({ isProd: true, dataBackend: 'firestore', sessionSecret: '' });
    expect(() => fresh.assertProdConfig()).toThrow(
      'Missing required production config: SESSION_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, GCP_PROJECT'
    );
  });

  it('assertProdConfig passes outside production and when everything is set', () => {
    expect(() => assertProdConfig()).not.toThrow();
    Object.assign(config, { isProd: true, sessionSecret: 's', gcpProject: 'p', dataBackend: 'firestore' });
    Object.assign(config.stripe, { secretKey: 'sk', webhookSecret: 'wh' });
    expect(() => assertProdConfig()).not.toThrow();
    config.gcpProject = '';
    expect(() => assertProdConfig()).toThrow('GCP_PROJECT');
    config.dataBackend = 'memory';
    expect(() => assertProdConfig()).not.toThrow();
  });
});

describe('passwords and sessions', () => {
  it('hashes with a salt and verifies only the right password', async () => {
    const a = await hashPassword('correct horse');
    const b = await hashPassword('correct horse');
    expect(a).not.toBe(b);
    expect(a).not.toContain('correct horse');
    expect(await verifyPassword('correct horse', a)).toBe(true);
    expect(await verifyPassword('wrong', a)).toBe(false);
  });

  it('round-trips a user id and rejects garbage, other secrets and expired tokens', () => {
    expect(verifySession(signSession('user-1'))).toBe('user-1');
    expect(verifySession('not-a-token')).toBeNull();

    const token = signSession('user-1');
    config.sessionSecret = 'a-different-secret';
    expect(verifySession(token)).toBeNull();
    config.sessionSecret = savedConfig.sessionSecret;

    vi.useFakeTimers({ now: Date.now() });
    const soon = signSession('user-1');
    vi.advanceTimersByTime((config.sessionTtlDays + 1) * 24 * 60 * 60 * 1000);
    expect(verifySession(soon)).toBeNull();
    vi.useRealTimers();
  });
});

describe('MemoryStore', () => {
  it('re-indexes a user when their email changes', async () => {
    const store = new MemoryStore();
    const user = await store.createUser({ id: '', email: 'Old@Example.com' });
    expect((await store.getUserByEmail('old@example.com'))?.id).toBe(user.id);

    await store.updateUser(user.id, { email: 'new@example.com' });
    expect(await store.getUserByEmail('old@example.com')).toBeNull();
    expect((await store.getUserByEmail('NEW@example.com'))?.id).toBe(user.id);
  });

  it('keeps a caller-supplied id and ignores updates to unknown users', async () => {
    const store = new MemoryStore();
    expect((await store.createUser({ id: 'fixed', email: 'a@b.co' })).id).toBe('fixed');
    await store.updateUser('nope', { email: 'x@y.zz' });
    expect(await store.getUserById('nope')).toBeNull();
    expect(await store.getUserByEmail('x@y.zz')).toBeNull();
  });

  it('scopes file metadata to its owner', async () => {
    const store = new MemoryStore();
    const meta = { id: 'f', name: 'n', size: 1, savedAt: 1 };
    await store.putFileMeta({ ...meta, userId: 'a' });
    expect(await store.getFileMeta('b', 'f')).toBeNull();
    expect(await store.listFiles('b')).toEqual([]);
    await store.deleteFileMeta('b', 'f');
    expect(await store.getFileMeta('a', 'f')).toMatchObject({ userId: 'a' });
  });
});

describe('store selection', () => {
  it('defaults to in-memory stores when no backend is configured', async () => {
    setStore(undefined as never);
    setBlobStore(undefined as never);
    expect(await getStore()).toBeInstanceOf(MemoryStore);
    expect(await getStore()).toBe(await getStore());
    expect(getBlobStore()).toBeInstanceOf(MemoryBlobStore);
  });

  it('MemoryBlobStore stores, returns and deletes bytes', async () => {
    const blobs = new MemoryBlobStore();
    expect(await blobs.get('k')).toBeNull();
    await blobs.put('k', Buffer.from([1, 2, 3]));
    expect(await blobs.get('k')).toEqual(Buffer.from([1, 2, 3]));
    await blobs.delete('k');
    expect(await blobs.get('k')).toBeNull();
  });
});

describe('serving the SPA', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

  async function appWithStatic() {
    const dir = mkdtempSync(join(tmpdir(), 'gmrt-static-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>spa</title>');
    writeFileSync(join(dir, 'app.js'), 'console.log(1)');
    config.staticDir = dir;
    const app = await buildApp();
    await app.ready();
    return app;
  }

  it('serves built assets and falls back to index.html for client routes', async () => {
    const app = await appWithStatic();
    const asset = await app.inject({ method: 'GET', url: '/app.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toBe('console.log(1)');

    for (const url of ['/', '/app/file/abc/issues/X', '/apiary']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('<title>spa</title>');
    }
  });

  it('keeps unknown API paths and non-GET requests as JSON 404s', async () => {
    const app = await appWithStatic();
    for (const req of [
      { method: 'GET', url: '/api/nope' },
      { method: 'GET', url: '/api' },
      { method: 'POST', url: '/app' },
    ] as const) {
      const res = await app.inject(req);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ message: 'Not found.' });
    }
  });

  it('serves no static files when STATIC_DIR is unset', async () => {
    config.staticDir = '';
    const app = await buildApp();
    expect((await app.inject({ method: 'GET', url: '/' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import type Stripe from 'stripe';
import { buildApp } from '../src/app.js';
import { MemoryStore } from '../src/store/memory.js';
import { MemoryBlobStore } from '../src/store/blobs.js';
import { setStore } from '../src/store/index.js';
import { setBlobStore } from '../src/store/blobs.js';
import { grantLicense, handleStripeEvent } from '../src/billing/stripe.js';

// Backend integration tests via fastify.inject (no live socket, no GCP/Stripe).

let app: FastifyInstance;
let store: MemoryStore;

beforeEach(async () => {
  store = new MemoryStore();
  setStore(store);
  setBlobStore(new MemoryBlobStore());
  app = await buildApp();
  await app.ready();
});

/** Extract the session cookie from a response, as a `cookie` header value. */
function sessionCookie(res: { cookies: Array<{ name: string; value: string }> }): string {
  const c = res.cookies.find((c) => c.name === 'gmrt_session');
  if (!c) throw new Error('no session cookie set');
  return `${c.name}=${c.value}`;
}

async function signup(email: string, password = 'password123') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    payload: { email, password },
  });
  return res;
}

const authed = (cookie: string, opts: InjectOptions): InjectOptions => ({
  ...opts,
  headers: { ...opts.headers, cookie },
});

describe('health', () => {
  it('responds ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe('auth', () => {
  it('signs up, sets a session, and returns the user from /me', async () => {
    const res = await signup('alice@example.com');
    expect(res.statusCode).toBe(201);
    expect(res.json().user.email).toBe('alice@example.com');

    const cookie = sessionCookie(res);
    const me = await app.inject(authed(cookie, { method: 'GET', url: '/api/auth/me' }));
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('alice@example.com');
  });

  it('rejects a duplicate email', async () => {
    await signup('bob@example.com');
    const dup = await signup('bob@example.com');
    expect(dup.statusCode).toBe(409);
  });

  it('rejects weak passwords and bad emails', async () => {
    expect((await signup('x@y.com', 'short')).statusCode).toBe(400);
    expect((await signup('not-an-email')).statusCode).toBe(400);
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    await signup('carol@example.com', 'password123');
    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'carol@example.com', password: 'password123' },
    });
    expect(ok.statusCode).toBe(200);

    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'carol@example.com', password: 'wrongpass1' },
    });
    expect(bad.statusCode).toBe(401);
  });

  it('requires a session for /me', async () => {
    const me = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(me.statusCode).toBe(401);
  });
});

describe('license', () => {
  it('reports none, then active after a purchase is granted', async () => {
    const res = await signup('dave@example.com');
    const cookie = sessionCookie(res);
    const userId = res.json().user.id;

    const before = await app.inject(authed(cookie, { method: 'GET', url: '/api/license' }));
    expect(before.json().status).toBe('none');

    await grantLicense(store, { userId });

    const after = await app.inject(authed(cookie, { method: 'GET', url: '/api/license' }));
    expect(after.json().status).toBe('active');
    expect(after.json().expiresAt).toBeGreaterThan(Date.now());
  });

  it('grants a license from a checkout.session.completed webhook event', async () => {
    const res = await signup('erin@example.com');
    const userId = res.json().user.id;

    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          metadata: { userId },
          customer: 'cus_123',
        },
      },
    } as unknown as Stripe.Event;
    await handleStripeEvent(event, store);

    const cookie = sessionCookie(res);
    const lic = await app.inject(authed(cookie, { method: 'GET', url: '/api/license' }));
    expect(lic.json().status).toBe('active');
  });

  it('revokes a license on a charge.refunded webhook event', async () => {
    const res = await signup('frank@example.com');
    const userId = res.json().user.id;
    await grantLicense(store, { userId, customerId: 'cus_frank' });

    const refund = {
      type: 'charge.refunded',
      data: { object: { customer: 'cus_frank', metadata: { userId } } },
    } as unknown as Stripe.Event;
    await handleStripeEvent(refund, store);

    const cookie = sessionCookie(res);
    const lic = await app.inject(authed(cookie, { method: 'GET', url: '/api/license' }));
    expect(lic.json().status).toBe('refunded');
  });
});

describe('cloud storage (zero-knowledge, licensed only)', () => {
  async function licensedUser(email: string): Promise<string> {
    const res = await signup(email);
    await grantLicense(store, { userId: res.json().user.id });
    return sessionCookie(res);
  }

  it('rejects keybag/files without a license (402)', async () => {
    const res = await signup('gina@example.com');
    const cookie = sessionCookie(res);
    const bag = await app.inject(authed(cookie, { method: 'GET', url: '/api/keybag' }));
    expect(bag.statusCode).toBe(402);
    const files = await app.inject(authed(cookie, { method: 'GET', url: '/api/files' }));
    expect(files.statusCode).toBe(402);
  });

  it('stores and returns the key envelope opaquely', async () => {
    const cookie = await licensedUser('hank@example.com');
    const envelope = JSON.stringify({ wrappedDEK: 'abc', salt: 'xyz' });
    const put = await app.inject(
      authed(cookie, { method: 'PUT', url: '/api/keybag', payload: { envelope } })
    );
    expect(put.statusCode).toBe(200);
    const get = await app.inject(authed(cookie, { method: 'GET', url: '/api/keybag' }));
    expect(get.json().envelope).toBe(envelope);
  });

  it('round-trips an encrypted blob byte-for-byte and lists it', async () => {
    const cookie = await licensedUser('iris@example.com');
    const ciphertext = Buffer.from([0, 1, 2, 250, 255, 42]);
    const encName = Buffer.from('encrypted-name').toString('base64');

    const put = await app.inject(
      authed(cookie, {
        method: 'PUT',
        url: '/api/files/abc123',
        headers: { 'content-type': 'application/octet-stream', 'x-file-name': encName },
        payload: ciphertext,
      })
    );
    expect(put.statusCode).toBe(200);

    const list = await app.inject(authed(cookie, { method: 'GET', url: '/api/files' }));
    expect(list.json().files).toHaveLength(1);
    expect(list.json().files[0]).toMatchObject({ id: 'abc123', name: encName, size: 6 });

    const get = await app.inject(authed(cookie, { method: 'GET', url: '/api/files/abc123' }));
    expect(get.statusCode).toBe(200);
    // Exact bytes come back — the server stored ciphertext, unchanged.
    expect(Buffer.from(get.rawPayload)).toEqual(ciphertext);
    expect(get.headers['x-file-name']).toBe(encName);

    const del = await app.inject(
      authed(cookie, { method: 'DELETE', url: '/api/files/abc123' })
    );
    expect(del.statusCode).toBe(200);
    const empty = await app.inject(authed(cookie, { method: 'GET', url: '/api/files' }));
    expect(empty.json().files).toHaveLength(0);
  });

  it("does not leak one user's files to another", async () => {
    const iris = await licensedUser('iris2@example.com');
    const encName = Buffer.from('n').toString('base64');
    await app.inject(
      authed(iris, {
        method: 'PUT',
        url: '/api/files/secret',
        headers: { 'content-type': 'application/octet-stream', 'x-file-name': encName },
        payload: Buffer.from('data'),
      })
    );
    const mallory = await licensedUser('mallory@example.com');
    const list = await app.inject(authed(mallory, { method: 'GET', url: '/api/files' }));
    expect(list.json().files).toHaveLength(0);
    const get = await app.inject(authed(mallory, { method: 'GET', url: '/api/files/secret' }));
    expect(get.statusCode).toBe(404);
  });
});

describe('auth input handling', () => {
  it.each([
    ['no body', {}],
    ['an empty JSON body', { headers: { 'content-type': 'application/json' }, payload: '' }],
    ['a JSON null', { headers: { 'content-type': 'application/json' }, payload: 'null' }],
    ['a JSON array', { payload: [] as unknown as object }],
    ['non-string fields', { payload: { email: 5, password: ['x'] } }],
  ])('rejects %s with 400 rather than crashing', async (_name, opts) => {
    for (const url of ['/api/auth/signup', '/api/auth/login']) {
      const res = await app.inject({ method: 'POST', url, ...(opts as InjectOptions) });
      expect(res.statusCode).toBe(400);
    }
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(res.statusCode).toBe(400);
  });

  it('normalizes email case and whitespace across signup and login', async () => {
    expect((await signup('  Mixed@Example.COM ')).json().user.email).toBe('mixed@example.com');
    expect((await signup('mixed@example.com')).statusCode).toBe(409);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'MIXED@example.com', password: 'password123' },
    });
    expect(login.statusCode).toBe(200);
  });

  it('gives the same error for an unknown email as for a wrong password', async () => {
    await signup('known@example.com');
    const attempt = (email: string) =>
      app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'wrongpass1' } });
    const [unknown, wrong] = [await attempt('nobody@example.com'), await attempt('known@example.com')];
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json()).toEqual(wrong.json());
  });

  it('never returns the password hash', async () => {
    const res = await signup('hash@example.com');
    expect(Object.keys(res.json().user).sort()).toEqual(['email', 'id']);
  });

  it('logout clears the session cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(200);
    const cleared = res.cookies.find((c) => c.name === 'gmrt_session');
    expect(cleared?.value).toBe('');
  });

  it('rejects a tampered or foreign session token', async () => {
    const res = await signup('tamper@example.com');
    const cookie = sessionCookie(res);
    const me = await app.inject(authed(cookie + 'x', { method: 'GET', url: '/api/auth/me' }));
    expect(me.statusCode).toBe(401);
  });

  it('rejects a valid session whose user no longer exists', async () => {
    const res = await signup('ghost@example.com');
    setStore(new MemoryStore()); // the account is gone
    const me = await app.inject(authed(sessionCookie(res), { method: 'GET', url: '/api/auth/me' }));
    expect(me.statusCode).toBe(401);
  });
});

describe('cloud storage input handling', () => {
  async function licensed(email: string): Promise<string> {
    const res = await signup(email);
    await grantLicense(store, { userId: res.json().user.id });
    return sessionCookie(res);
  }
  const put = (cookie: string, id: string, opts: Partial<InjectOptions> = {}) =>
    app.inject(
      authed(cookie, {
        method: 'PUT',
        url: `/api/files/${id}`,
        headers: { 'content-type': 'application/octet-stream', 'x-file-name': 'bmFtZQ==' },
        payload: Buffer.from('ciphertext'),
        ...opts,
      })
    );

  it('requires a session before anything else', async () => {
    for (const url of ['/api/keybag', '/api/files', '/api/files/abc', '/api/license']) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    }
  });

  it('stops serving stored files once the license lapses or is refunded', async () => {
    const res = await signup('lapsed@example.com');
    const cookie = sessionCookie(res);
    const userId = res.json().user.id;
    await grantLicense(store, { userId });
    expect((await put(cookie, 'abc')).statusCode).toBe(200);

    await store.putLicense({ ...(await store.getLicense(userId))!, expiresAt: Date.now() - 1 });
    expect((await app.inject(authed(cookie, { method: 'GET', url: '/api/files/abc' }))).statusCode).toBe(402);
    const lic = await app.inject(authed(cookie, { method: 'GET', url: '/api/license' }));
    expect(lic.json().status).toBe('expired');
  });

  it.each([
    ['a path separator', 'a%2Fb'],
    ['a parent-directory segment', '..%2Fother-user%2Fabc'],
    ['a dot', 'a.b'],
    ['a space', 'a%20b'],
  ])('rejects a file id containing %s', async (_name, id) => {
    const cookie = await licensed('ids@example.com');
    expect((await put(cookie, id)).statusCode).toBe(400);
    expect((await app.inject(authed(cookie, { method: 'GET', url: `/api/files/${id}` }))).statusCode).toBe(400);
    expect((await app.inject(authed(cookie, { method: 'DELETE', url: `/api/files/${id}` }))).statusCode).toBe(400);
    expect((await app.inject(authed(cookie, { method: 'GET', url: '/api/files' }))).json().files).toEqual([]);
  });

  it('rejects an over-long file id', async () => {
    const cookie = await licensed('long@example.com');
    // Fastify's own parameter-length limit answers first (414); either way it
    // must not be stored.
    expect([400, 414]).toContain((await put(cookie, 'a'.repeat(129))).statusCode);
    expect((await app.inject(authed(cookie, { method: 'GET', url: '/api/files' }))).json().files).toEqual([]);
  });

  it('accepts checksum-style ids (hex, and the fallback hash form)', async () => {
    const cookie = await licensed('okids@example.com');
    expect((await put(cookie, 'a'.repeat(64))).statusCode).toBe(200);
    expect((await put(cookie, 'f1a2b3c4-1024')).statusCode).toBe(200);
  });

  it('rejects an upload with no body, a JSON body, or no encrypted name', async () => {
    const cookie = await licensed('bad@example.com');
    expect((await put(cookie, 'abc', { payload: Buffer.alloc(0) })).statusCode).toBe(400);
    expect(
      (await put(cookie, 'abc', { headers: { 'content-type': 'application/json', 'x-file-name': 'x' }, payload: { a: 1 } }))
        .statusCode
    ).toBe(400);
    expect(
      (await put(cookie, 'abc', { headers: { 'content-type': 'application/octet-stream' } })).statusCode
    ).toBe(400);
  });

  it('overwrites a file in place and lists newest first', async () => {
    const cookie = await licensed('order@example.com');
    await put(cookie, 'old');
    await new Promise((r) => setTimeout(r, 5));
    await put(cookie, 'new');
    await new Promise((r) => setTimeout(r, 5));
    await put(cookie, 'old', { payload: Buffer.from('longer ciphertext') });
    const { files } = (await app.inject(authed(cookie, { method: 'GET', url: '/api/files' }))).json();
    expect(files.map((f: { id: string }) => f.id)).toEqual(['old', 'new']);
    expect(files[0].size).toBe('longer ciphertext'.length);
  });

  it('404s a missing file, and deleting one is idempotent', async () => {
    const cookie = await licensed('missing@example.com');
    expect((await app.inject(authed(cookie, { method: 'GET', url: '/api/files/nope' }))).statusCode).toBe(404);
    expect((await app.inject(authed(cookie, { method: 'DELETE', url: '/api/files/nope' }))).statusCode).toBe(200);
  });

  it('404s the key envelope until one is stored, and validates it', async () => {
    const cookie = await licensed('bag@example.com');
    expect((await app.inject(authed(cookie, { method: 'GET', url: '/api/keybag' }))).statusCode).toBe(404);
    for (const payload of [{}, { envelope: '' }, { envelope: { not: 'a string' } }]) {
      const res = await app.inject(authed(cookie, { method: 'PUT', url: '/api/keybag', payload }));
      expect(res.statusCode).toBe(400);
    }
    const empty = await app.inject(
      authed(cookie, { method: 'PUT', url: '/api/keybag', headers: { 'content-type': 'application/json' }, payload: '' })
    );
    expect(empty.statusCode).toBe(400);
  });

  it("keeps each user's key envelope separate", async () => {
    const a = await licensed('bag-a@example.com');
    const b = await licensed('bag-b@example.com');
    await app.inject(authed(a, { method: 'PUT', url: '/api/keybag', payload: { envelope: 'A' } }));
    expect((await app.inject(authed(b, { method: 'GET', url: '/api/keybag' }))).statusCode).toBe(404);
  });
});

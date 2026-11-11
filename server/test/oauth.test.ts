import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { config } from '../src/config.js';
import { MemoryStore } from '../src/store/memory.js';
import { setStore } from '../src/store/index.js';
import { safeNext } from '../src/routes/oauth.js';

// Google login. Google itself is replaced by a stubbed fetch; everything on
// our side of the redirect (state binding, account lookup, session) is real.

let app: FastifyInstance;
let store: MemoryStore;
const saved = { ...config.google };

async function start(google: { clientId: string; clientSecret: string }) {
  Object.assign(config.google, google);
  store = new MemoryStore();
  setStore(store);
  app = await buildApp();
  await app.ready();
}

afterEach(() => {
  Object.assign(config.google, saved);
  vi.unstubAllGlobals();
});

/** A Google-style id_token; only the payload segment matters to the server. */
function idToken(payload: Record<string, unknown>): string {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64(payload)}.signature`;
}

function stubGoogle(response: { ok?: boolean; body?: unknown }) {
  const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ({
    ok: response.ok ?? true,
    json: async () => response.body ?? {},
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Begin a login and return what the browser would carry into the callback. */
async function begin(next?: string) {
  const res = await app.inject({
    method: 'GET',
    url: `/api/auth/oauth/google${next === undefined ? '' : `?next=${encodeURIComponent(next)}`}`,
  });
  const location = new URL(res.headers.location as string);
  const stateCookie = res.cookies.find((c) => c.name === 'gmrt_oauth_state')!;
  return {
    res,
    location,
    state: location.searchParams.get('state')!,
    cookie: `${stateCookie.name}=${stateCookie.value}`,
    stateCookie,
  };
}

const callback = (query: Record<string, string>, cookie?: string) =>
  app.inject({
    method: 'GET',
    url: `/api/auth/oauth/google/callback?${new URLSearchParams(query)}`,
    headers: cookie ? { cookie } : {},
  });

describe('safeNext', () => {
  it.each(['/app', '/account/billing?canceled=1', '/app/file/abc/issues/X%3A1'])(
    'keeps the same-app path %s',
    (path) => expect(safeNext(path)).toBe(path)
  );

  it.each([
    ['an absolute URL', 'https://evil.example/'],
    ['a protocol-relative URL', '//evil.example'],
    ['a backslash the browser reads as a slash', '/\\evil.example'],
    ['a later backslash', '/app\\..\\x'],
    ['a tab the browser strips', '/\t/evil.example'],
    ['a newline the browser strips', '/\n/evil.example'],
    ['a relative path', 'app'],
    ['an empty string', ''],
    ['a non-string', ['/app']],
    ['nothing', undefined],
  ])('falls back to /app for %s', (_name, value) => expect(safeNext(value)).toBe('/app'));
});

describe('Google login when not configured', () => {
  beforeEach(() => start({ clientId: '', clientSecret: '' }));

  it('404s both endpoints', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/auth/oauth/google' })).statusCode).toBe(404);
    expect((await callback({ code: 'c', state: 's' })).statusCode).toBe(404);
  });
});

describe('Google login', () => {
  beforeEach(() => start({ clientId: 'client-id', clientSecret: 'client-secret' }));

  it('redirects to Google with a per-attempt state bound to a cookie', async () => {
    const a = await begin('/account');
    expect(a.res.statusCode).toBe(302);
    expect(a.location.origin + a.location.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth'
    );
    expect(Object.fromEntries(a.location.searchParams)).toMatchObject({
      client_id: 'client-id',
      response_type: 'code',
      scope: 'openid email',
      redirect_uri: `${config.publicBaseUrl}/api/auth/oauth/google/callback`,
    });
    expect(a.state).toBe(`${a.stateCookie.value}:/account`);
    expect(a.stateCookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' });

    const b = await begin('/account');
    expect(b.stateCookie.value).not.toBe(a.stateCookie.value);
  });

  it('never carries an off-site next into the state', async () => {
    expect((await begin('//evil.example')).state).toMatch(/:\/app$/);
    expect((await begin('/\\evil.example')).state).toMatch(/:\/app$/);
    expect((await begin()).state).toMatch(/:\/app$/);
  });

  it('requires an authorization code', async () => {
    expect((await callback({ state: 'x' })).statusCode).toBe(400);
  });

  it('signs in a new user, creating the account, and returns them to next', async () => {
    const fetchMock = stubGoogle({
      body: { id_token: idToken({ email: 'New.User@Example.com', email_verified: true }) },
    });
    const { state, cookie } = await begin('/account/billing');

    const res = await callback({ code: 'auth-code', state }, cookie);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/account/billing');

    // The code was exchanged with our client credentials.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(Object.fromEntries(init!.body as URLSearchParams)).toMatchObject({
      code: 'auth-code',
      client_id: 'client-id',
      client_secret: 'client-secret',
      grant_type: 'authorization_code',
    });

    const user = await store.getUserByEmail('new.user@example.com');
    expect(user).toMatchObject({ email: 'new.user@example.com' });
    expect(user?.passwordHash).toBeUndefined();

    const session = res.cookies.find((c) => c.name === 'gmrt_session')!;
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `${session.name}=${session.value}` },
    });
    expect(me.json().user.id).toBe(user!.id);
    // The one-time state cookie is cleared.
    expect(res.cookies.find((c) => c.name === 'gmrt_oauth_state')?.value).toBe('');
  });

  it('signs an existing email/password user into the same account', async () => {
    const signup = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'both@example.com', password: 'password123' },
    });
    stubGoogle({ body: { id_token: idToken({ email: 'both@example.com', email_verified: 'true' }) } });
    const { state, cookie } = await begin();
    const res = await callback({ code: 'c', state }, cookie);
    expect(res.headers.location).toBe('/app');
    const session = res.cookies.find((c) => c.name === 'gmrt_session')!;
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `${session.name}=${session.value}` },
    });
    expect(me.json().user.id).toBe(signup.json().user.id);
  });

  it.each([
    ['no state cookie (a callback URL planted by someone else)', (s: string) => [s, undefined]],
    ['a state from a different attempt', (_s: string, c: string) => ['0000:/app', c]],
    ['a state with no nonce', (_s: string, c: string) => ['/app', c]],
  ] as Array<[string, (state: string, cookie: string) => [string, string | undefined]]>)(
    'refuses %s without contacting Google or creating a session',
    async (_name, tamper) => {
      const fetchMock = stubGoogle({
        body: { id_token: idToken({ email: 'attacker@example.com', email_verified: true }) },
      });
      const { state, cookie } = await begin();
      const [badState, badCookie] = tamper(state, cookie);
      const res = await callback({ code: 'attackers-code', state: badState }, badCookie);
      expect(res.headers.location).toBe('/login?error=oauth');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(res.cookies.find((c) => c.name === 'gmrt_session')).toBeUndefined();
      expect(await store.getUserByEmail('attacker@example.com')).toBeNull();
    }
  );

  it.each([
    ['the token exchange fails', { ok: false }],
    ['no id_token comes back', { body: {} }],
    ['the id_token is not a JWT', { body: { id_token: 'nope' } }],
    ['the id_token payload is not JSON', { body: { id_token: 'a.!!!.c' } }],
    ['the id_token has no email', { body: { id_token: idToken({ sub: '1' }) } }],
    [
      'the email is not verified by Google',
      { body: { id_token: idToken({ email: 'victim@example.com', email_verified: false }) } },
    ],
    [
      'email_verified is missing',
      { body: { id_token: idToken({ email: 'victim@example.com' }) } },
    ],
  ])('sends the user back to login when %s', async (_name, response) => {
    stubGoogle(response);
    const { state, cookie } = await begin();
    const res = await callback({ code: 'c', state }, cookie);
    expect(res.headers.location).toBe('/login?error=oauth');
    expect(res.cookies.find((c) => c.name === 'gmrt_session')).toBeUndefined();
    expect(await store.getUserByEmail('victim@example.com')).toBeNull();
  });
});

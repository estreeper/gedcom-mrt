import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { getStore } from '../store/index.js';
import { setSessionCookie } from '../auth/session.js';

// Google social login (OAuth 2.0 authorization-code flow). Enabled only when
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are configured. Uses fetch directly to
// avoid an extra dependency. On success we set the same session cookie the
// email/password flow uses. Encryption for cloud storage is decoupled from the
// login method (a separate passphrase), so social users work identically.

const REDIRECT_PATH = '/api/auth/oauth/google/callback';

function redirectUri(): string {
  return `${config.publicBaseUrl}${REDIRECT_PATH}`;
}

const STATE_COOKIE = 'gmrt_oauth_state';
const STATE_TTL_SECONDS = 10 * 60;

/**
 * Only allow same-app relative paths, never an open redirect. Browsers treat
 * a backslash like a slash and skip tabs/newlines when resolving a URL, so
 * `/\evil.example` and `/<tab>/evil.example` are as much a way off-site as
 * `//evil.example`; reject any path containing them.
 */
export function safeNext(next: unknown): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//')) {
    return '/app';
  }
  for (const ch of next) {
    if (ch === '\\' || ch < ' ' || ch === '\x7f') return '/app';
  }
  return next;
}

function sameToken(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function oauthRoutes(fastify: FastifyInstance): Promise<void> {
  const enabled = Boolean(config.google.clientId && config.google.clientSecret);

  fastify.get('/auth/oauth/google', async (request, reply) => {
    if (!enabled) return reply.code(404).send({ message: 'Google login is not enabled.' });
    const next = safeNext((request.query as { next?: string }).next);
    // Bind this login attempt to this browser: a random nonce goes in a
    // cookie and in `state`, and the callback requires them to match.
    // Without it, an attacker could hand a victim a callback URL carrying the
    // attacker's own authorization code and sign them into the attacker's
    // account (login CSRF).
    const nonce = randomBytes(16).toString('hex');
    reply.setCookie(STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      path: REDIRECT_PATH,
      maxAge: STATE_TTL_SECONDS,
    });
    const params = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: 'openid email',
      access_type: 'online',
      state: `${nonce}:${next}`,
      prompt: 'select_account',
    });
    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  fastify.get('/auth/oauth/google/callback', async (request, reply) => {
    if (!enabled) return reply.code(404).send({ message: 'Google login is not enabled.' });
    const { code, state } = request.query as { code?: string; state?: string };
    if (!code) return reply.code(400).send({ message: 'Missing authorization code.' });

    const expected = request.cookies?.[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, { path: REDIRECT_PATH });
    const sep = typeof state === 'string' ? state.indexOf(':') : -1;
    if (!expected || sep < 0 || !sameToken(state!.slice(0, sep), expected)) {
      request.log.warn('Google OAuth state mismatch');
      return reply.redirect('/login?error=oauth');
    }
    const next = safeNext(state!.slice(sep + 1));

    // Exchange the code for tokens.
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: redirectUri(),
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      request.log.warn('Google token exchange failed');
      return reply.redirect('/login?error=oauth');
    }
    const tokens = (await tokenRes.json()) as { id_token?: string };
    const email = emailFromIdToken(tokens.id_token);
    if (!email) return reply.redirect('/login?error=oauth');

    // Find or create the account for this email.
    const store = await getStore();
    let user = await store.getUserByEmail(email);
    if (!user) user = await store.createUser({ id: '', email });

    setSessionCookie(reply, user.id);
    return reply.redirect(next);
  });
}

/**
 * Decode the id_token JWT payload to read the email. The token came straight
 * from Google's token endpoint over TLS, so its signature needn't be checked,
 * but the email must be one Google has verified — we key accounts on it, and
 * an unverified address would let someone sign in as its real owner.
 */
function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    ) as { email?: unknown; email_verified?: unknown };
    if (typeof payload.email !== 'string' || !payload.email) return null;
    if (payload.email_verified !== true && payload.email_verified !== 'true') return null;
    return payload.email.toLowerCase();
  } catch {
    return null;
  }
}

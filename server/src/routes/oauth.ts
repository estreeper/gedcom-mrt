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

function safeNext(next: unknown): string {
  // Only allow same-app relative paths, never an open redirect.
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) {
    return next;
  }
  return '/app';
}

export async function oauthRoutes(fastify: FastifyInstance): Promise<void> {
  const enabled = Boolean(config.google.clientId && config.google.clientSecret);

  fastify.get('/auth/oauth/google', async (request, reply) => {
    if (!enabled) return reply.code(404).send({ message: 'Google login is not enabled.' });
    const next = safeNext((request.query as { next?: string }).next);
    const params = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: 'openid email',
      access_type: 'online',
      state: next,
      prompt: 'select_account',
    });
    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  fastify.get('/auth/oauth/google/callback', async (request, reply) => {
    if (!enabled) return reply.code(404).send({ message: 'Google login is not enabled.' });
    const { code, state } = request.query as { code?: string; state?: string };
    if (!code) return reply.code(400).send({ message: 'Missing authorization code.' });

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
    return reply.redirect(safeNext(state));
  });
}

/** Decode the (already-Google-verified) id_token JWT payload to read the email. */
function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    ) as { email?: string; email_verified?: boolean };
    if (!payload.email) return null;
    return payload.email.toLowerCase();
  } catch {
    return null;
  }
}

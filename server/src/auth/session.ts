import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';

// Stateless sessions: a signed JWT carrying the user id, stored in an httpOnly
// cookie. Same-origin SPA + API, so a cookie is the simplest transport.

const DAY_MS = 24 * 60 * 60 * 1000;

interface SessionClaims {
  sub: string; // userId
}

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId } satisfies SessionClaims, config.sessionSecret, {
    expiresIn: `${config.sessionTtlDays}d`,
  });
}

export function verifySession(token: string): string | null {
  try {
    const decoded = jwt.verify(token, config.sessionSecret) as SessionClaims;
    return decoded.sub ?? null;
  } catch {
    return null;
  }
}

export function setSessionCookie(reply: FastifyReply, userId: string): void {
  reply.setCookie(config.sessionCookie, signSession(userId), {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: config.sessionTtlDays * DAY_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(config.sessionCookie, { path: '/' });
}

/** Read + verify the session cookie. Returns the userId or null. */
export function userIdFromRequest(request: FastifyRequest): string | null {
  const token = request.cookies?.[config.sessionCookie];
  return token ? verifySession(token) : null;
}

/**
 * Fastify preHandler that requires a valid session. On success sets
 * request.userId; otherwise replies 401 and stops the request.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = userIdFromRequest(request);
  if (!userId) {
    reply.code(401).send({ message: 'Not signed in.' });
    return;
  }
  request.userId = userId;
}

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

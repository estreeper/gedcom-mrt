import type { FastifyInstance } from 'fastify';
import { getStore } from '../store/index.js';
import type { User } from '../store/types.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import {
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
} from '../auth/session.js';

// Email + password accounts. (Social login lives in routes/oauth.ts.)

interface Credentials {
  email?: unknown;
  password?: unknown;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(u: User) {
  return { id: u.id, email: u.email };
}

function validate(body: Credentials): { email: string; password: string } | string {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!EMAIL_RE.test(email)) return 'Enter a valid email address.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  return { email, password };
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/auth/signup', async (request, reply) => {
    const parsed = validate(request.body as Credentials);
    if (typeof parsed === 'string') return reply.code(400).send({ message: parsed });

    const store = await getStore();
    if (await store.getUserByEmail(parsed.email)) {
      return reply.code(409).send({ message: 'An account with that email already exists.' });
    }
    const user = await store.createUser({
      id: '',
      email: parsed.email,
      passwordHash: await hashPassword(parsed.password),
    });
    setSessionCookie(reply, user.id);
    return reply.code(201).send({ user: publicUser(user) });
  });

  fastify.post('/auth/login', async (request, reply) => {
    const parsed = validate(request.body as Credentials);
    if (typeof parsed === 'string') return reply.code(400).send({ message: parsed });

    const store = await getStore();
    const user = await store.getUserByEmail(parsed.email);
    // Same generic error whether the email or the password was wrong.
    if (!user || !user.passwordHash || !(await verifyPassword(parsed.password, user.passwordHash))) {
      return reply.code(401).send({ message: 'Incorrect email or password.' });
    }
    setSessionCookie(reply, user.id);
    return reply.send({ user: publicUser(user) });
  });

  fastify.post('/auth/logout', async (_request, reply) => {
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  fastify.get('/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    const store = await getStore();
    const user = await store.getUserById(request.userId!);
    if (!user) return reply.code(401).send({ message: 'Not signed in.' });
    return reply.send({ user: publicUser(user) });
  });
}

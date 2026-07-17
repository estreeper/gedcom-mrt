import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { config } from './config.js';
import { authRoutes } from './routes/auth.js';
import { oauthRoutes } from './routes/oauth.js';
import { licenseRoutes } from './routes/license.js';
import { billingRoutes } from './routes/billing.js';
import { keybagRoutes } from './routes/keybag.js';
import { fileRoutes } from './routes/files.js';

// Builds the Fastify app WITHOUT starting it, so tests can use app.inject().

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.isProd ? true : { level: 'warn' },
    bodyLimit: 20 * 1024 * 1024, // room for encrypted GEDCOM blobs (Phase 4)
  });

  await app.register(cookie);

  // Keep the raw JSON body around so the Stripe webhook can verify its
  // signature (Stripe signs the exact bytes it sent).
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) => {
      (req as { rawBody?: string }).rawBody = body as string;
      if (body === '') return done(null, undefined);
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        (err as { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    }
  );

  // Encrypted file blobs (Phase 4) are uploaded as raw bytes.
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body)
  );

  await app.register(
    async (api) => {
      api.get('/health', async () => ({ ok: true }));
      await authRoutes(api);
      await oauthRoutes(api);
      await licenseRoutes(api);
      await billingRoutes(api);
      await keybagRoutes(api);
      await fileRoutes(api);
    },
    { prefix: '/api' }
  );

  if (config.staticDir) {
    await registerStatic(app, config.staticDir);
  }

  return app;
}

/** Serve the built SPA and fall back to index.html for client-side routes. */
async function registerStatic(app: FastifyInstance, dir: string): Promise<void> {
  const { default: fastifyStatic } = await import('@fastify/static');
  await app.register(fastifyStatic, { root: dir, wildcard: false });
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ message: 'Not found.' });
  });
}

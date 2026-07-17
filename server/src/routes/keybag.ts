import type { FastifyInstance } from 'fastify';
import { getStore } from '../store/index.js';
import { requireAuth } from '../auth/session.js';
import { requireLicense } from '../auth/licenseGuard.js';

// The per-user key envelope for zero-knowledge file encryption. The `envelope`
// is an opaque client-produced JSON string (wrapped DEK + KDF params + recovery
// wrap). The server stores and returns it but cannot unwrap it.

export async function keybagRoutes(fastify: FastifyInstance): Promise<void> {
  const guard = { preHandler: [requireAuth, requireLicense] };

  fastify.get('/keybag', guard, async (request, reply) => {
    const store = await getStore();
    const bag = await store.getKeybag(request.userId!);
    if (!bag) return reply.code(404).send({ message: 'No key envelope yet.' });
    return reply.send({ envelope: bag.envelope, updatedAt: bag.updatedAt });
  });

  fastify.put('/keybag', guard, async (request, reply) => {
    const body = request.body as { envelope?: unknown };
    if (typeof body?.envelope !== 'string' || body.envelope.length === 0) {
      return reply.code(400).send({ message: 'Missing key envelope.' });
    }
    const store = await getStore();
    await store.putKeybag({
      userId: request.userId!,
      envelope: body.envelope,
      updatedAt: Date.now(),
    });
    return reply.send({ ok: true });
  });
}

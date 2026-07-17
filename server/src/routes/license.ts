import type { FastifyInstance } from 'fastify';
import { getStore } from '../store/index.js';
import { licenseStatus } from '../store/types.js';
import { requireAuth } from '../auth/session.js';

// The client polls GET /license to decide whether to unlock applying repairs.
// The gate is soft (the app runs locally), so this is a convenience/UX signal,
// not a hard enforcement boundary.

export async function licenseRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/license', { preHandler: requireAuth }, async (request, reply) => {
    const store = await getStore();
    const license = await store.getLicense(request.userId!);
    const status = licenseStatus(license, Date.now());
    return reply.send({
      status,
      plan: license?.plan ?? null,
      expiresAt: license?.expiresAt ?? null,
    });
  });
}

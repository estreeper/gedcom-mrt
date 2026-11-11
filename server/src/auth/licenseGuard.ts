import type { FastifyReply, FastifyRequest } from 'fastify';
import { getStore } from '../store/index.js';
import { licenseStatus } from '../store/types.js';

// Gate for paid, server-side features (cloud storage). Must run AFTER
// requireAuth (which sets request.userId). Returns 402 when unlicensed.

export async function requireLicense(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply | void> {
  const store = await getStore();
  const license = await store.getLicense(request.userId!);
  if (licenseStatus(license, Date.now()) !== 'active') {
    return reply.code(402).send({ message: 'A license is required for cloud storage.' });
  }
}

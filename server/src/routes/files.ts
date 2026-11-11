import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getStore } from '../store/index.js';
import { getBlobStore } from '../store/blobs.js';
import { requireAuth } from '../auth/session.js';
import { requireLicense } from '../auth/licenseGuard.js';

// Zero-knowledge file storage. The request/response bodies are ciphertext the
// server never decrypts. The filename is also encrypted client-side and passed
// as the base64 `x-file-name` header, so only opaque ids + sizes are in clear.

const KEY = (userId: string, id: string) => `${userId}/${id}`;

const MAX_ID_LENGTH = 128;

/**
 * File ids are content checksums chosen by the client. They become part of a
 * blob key and a Firestore document id, so hold them to a plain token — no
 * path separators or dots that could address something else.
 */
function validId(id: string): boolean {
  if (id.length === 0 || id.length > MAX_ID_LENGTH) return false;
  for (const ch of id) {
    const ok =
      (ch >= 'a' && ch <= 'z') ||
      (ch >= 'A' && ch <= 'Z') ||
      (ch >= '0' && ch <= '9') ||
      ch === '-' ||
      ch === '_';
    if (!ok) return false;
  }
  return true;
}

export async function fileRoutes(fastify: FastifyInstance): Promise<void> {
  const requireValidId = async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as { id?: string }).id;
    if (id !== undefined && !validId(id)) {
      return reply.code(400).send({ message: 'Invalid file id.' });
    }
  };
  const guard = { preHandler: [requireAuth, requireLicense, requireValidId] };

  fastify.get('/files', guard, async (request, reply) => {
    const store = await getStore();
    const files = await store.listFiles(request.userId!);
    return reply.send({
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
        savedAt: f.savedAt,
      })),
    });
  });

  fastify.put('/files/:id', guard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return reply.code(400).send({ message: 'Expected an encrypted body.' });
    }
    const name = request.headers['x-file-name'];
    if (typeof name !== 'string' || name.length === 0) {
      return reply.code(400).send({ message: 'Missing encrypted file name.' });
    }
    const userId = request.userId!;
    const store = await getStore();
    await getBlobStore().put(KEY(userId, id), body);
    await store.putFileMeta({
      id,
      userId,
      name, // base64 ciphertext of the name
      size: body.length,
      savedAt: Date.now(),
    });
    return reply.send({ ok: true });
  });

  fastify.get('/files/:id', guard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const userId = request.userId!;
    const store = await getStore();
    const meta = await store.getFileMeta(userId, id);
    const blob = await getBlobStore().get(KEY(userId, id));
    if (!meta || !blob) return reply.code(404).send({ message: 'File not found.' });
    reply.header('content-type', 'application/octet-stream');
    reply.header('x-file-name', meta.name);
    return reply.send(blob);
  });

  fastify.delete('/files/:id', guard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const userId = request.userId!;
    const store = await getStore();
    await getBlobStore().delete(KEY(userId, id));
    await store.deleteFileMeta(userId, id);
    return reply.send({ ok: true });
  });
}

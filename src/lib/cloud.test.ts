import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createEnvelope } from './crypto/keys';
import { saveCloud, listCloud, loadCloudText, deleteCloud } from './cloud';

// Exercises the cloud client end-to-end against a tiny in-memory fake of the
// backend, using REAL Web Crypto. Proves the round-trip works and that the
// bytes handed to the "server" are ciphertext (zero-knowledge).

interface Stored {
  body: Uint8Array;
  name: string; // encrypted (base64), from x-file-name header
  savedAt: number;
}

const blobs = new Map<string, Stored>(); // id -> stored

function fakeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const method = init.method ?? 'GET';
  const path = url.replace('/api', '');

  const json = (body: unknown, status = 200) =>
    ({
      ok: status < 400,
      status,
      statusText: '',
      json: async () => body,
      arrayBuffer: async () => new ArrayBuffer(0),
      text: async () => JSON.stringify(body),
    }) as Response;

  if (path === '/files' && method === 'GET') {
    const files = [...blobs.entries()].map(([id, s]) => ({
      id,
      name: s.name,
      size: s.body.length,
      savedAt: s.savedAt,
    }));
    return Promise.resolve(json({ files }));
  }

  const fileMatch = path.match(/^\/files\/(.+)$/);
  if (fileMatch) {
    const id = decodeURIComponent(fileMatch[1]);
    if (method === 'PUT') {
      const headers = init.headers as Record<string, string>;
      blobs.set(id, {
        body: new Uint8Array(init.body as ArrayBuffer),
        name: headers['x-file-name'],
        savedAt: Date.now(),
      });
      return Promise.resolve(json({ ok: true }));
    }
    if (method === 'GET') {
      const s = blobs.get(id);
      if (!s) return Promise.resolve(json({ message: 'not found' }, 404));
      const view = s.body;
      const ab = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: '',
        arrayBuffer: async () => ab,
        json: async () => ({}),
        text: async () => '',
      } as Response);
    }
    if (method === 'DELETE') {
      blobs.delete(id);
      return Promise.resolve(json({ ok: true }));
    }
  }

  return Promise.resolve(json({ message: 'unhandled' }, 500));
}

describe('cloud client (zero-knowledge round-trip)', () => {
  beforeEach(() => {
    blobs.clear();
    // Date.now is used for savedAt; leave real.
    vi.stubGlobal('fetch', fakeFetch as unknown as typeof fetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  const GED = '0 HEAD\n1 SOUR X\n0 @I1@ INDI\n1 NAME John /Smith/\n0 TRLR\n';

  it('uploads ciphertext, lists with decrypted name, and downloads plaintext', async () => {
    const { dek } = await createEnvelope('a good passphrase');

    await saveCloud('file-1', 'my-tree.ged', GED, dek);

    // The bytes the server received are ciphertext — no plaintext leaks.
    const stored = blobs.get('file-1')!;
    const asText = new TextDecoder().decode(stored.body);
    expect(asText).not.toContain('John');
    expect(asText).not.toContain('INDI');
    // The stored name is encrypted too (not the plaintext filename).
    expect(stored.name).not.toContain('my-tree');

    const list = await listCloud(dek);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'file-1', name: 'my-tree.ged' });

    const text = await loadCloudText('file-1', dek);
    expect(text).toBe(GED);

    await deleteCloud('file-1');
    expect(await listCloud(dek)).toHaveLength(0);
  });

  it('cannot decrypt another user’s DEK-encrypted blob', async () => {
    const alice = await createEnvelope('alice pass');
    const bob = await createEnvelope('bob pass');
    await saveCloud('shared-id', 'secret.ged', GED, alice.dek);

    // Bob has a different DEK; decryption fails (GCM auth tag mismatch).
    await expect(loadCloudText('shared-id', bob.dek)).rejects.toBeTruthy();
  });
});

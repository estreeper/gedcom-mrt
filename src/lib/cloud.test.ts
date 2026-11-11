import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createEnvelope, encryptToBase64 } from './crypto/keys';
import {
  saveCloud,
  listCloud,
  loadCloudText,
  deleteCloud,
  getKeyEnvelope,
  putKeyEnvelope,
} from './cloud';
import { installFakeApi, reply, fail } from '../test/fakeApi';

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

describe('cloud client edge cases', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows a placeholder for a name encrypted under a different key, newest first', async () => {
    const mine = await createEnvelope('mine');
    const other = await createEnvelope('other');
    const server = installFakeApi({
      'GET /files': async () =>
        reply({
          files: [
            { id: 'old', name: await encryptToBase64(mine.dek, 'old.ged'), size: 1, savedAt: 10 },
            { id: 'foreign', name: await encryptToBase64(other.dek, 'x.ged'), size: 2, savedAt: 30 },
            { id: 'junk', name: 'not base64 ciphertext', size: 3, savedAt: 20 },
          ],
        }),
    });
    expect(await listCloud(mine.dek)).toEqual([
      { id: 'foreign', name: '(encrypted)', size: 2, savedAt: 30 },
      { id: 'junk', name: '(encrypted)', size: 3, savedAt: 20 },
      { id: 'old', name: 'old.ged', size: 1, savedAt: 10 },
    ]);
    expect(server.calls).toHaveLength(1);
  });

  it('escapes the file id in the URL', async () => {
    const { dek } = await createEnvelope('p');
    const server = installFakeApi({
      'PUT /files/a%2Fb%20c': reply({ ok: true }),
      'DELETE /files/a%2Fb%20c': reply({ ok: true }),
    });
    await saveCloud('a/b c', 'n.ged', 'text', dek);
    await deleteCloud('a/b c');
    expect(server.calls.map((c) => c.path)).toEqual(['/files/a%2Fb%20c', '/files/a%2Fb%20c']);
    expect(server.calls[0].headers['content-type']).toBe('application/octet-stream');
  });

  it('round-trips the key envelope and treats 404 as "none yet"', async () => {
    const { envelope } = await createEnvelope('p');
    let stored: string | undefined;
    installFakeApi({
      'GET /keybag': () => (stored ? reply({ envelope: stored }) : fail(404, 'No key envelope yet.')),
      'PUT /keybag': (call) => {
        stored = (call.body as { envelope: string }).envelope;
        return reply({ ok: true });
      },
    });
    expect(await getKeyEnvelope()).toBeNull();
    await putKeyEnvelope(envelope);
    expect(await getKeyEnvelope()).toEqual(envelope);
  });

  it('surfaces key-envelope errors other than 404', async () => {
    installFakeApi({ 'GET /keybag': fail(402, 'A license is required for cloud storage.') });
    await expect(getKeyEnvelope()).rejects.toMatchObject({ status: 402 });
  });
});

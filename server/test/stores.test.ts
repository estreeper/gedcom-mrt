import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DataStore } from '../src/store/types.js';
import type { BlobStore } from '../src/store/blobs.js';
import { MemoryStore } from '../src/store/memory.js';

// The production stores talk to Firestore and GCS. Their SDKs are replaced by
// small in-memory fakes so the SAME behavioural contract can be run against
// the memory store and the production adapters — the routes rely on the two
// behaving identically.

type Doc = Record<string, unknown>;
const collections = new Map<string, Map<string, Doc>>();
const firestoreOptions: unknown[] = [];

vi.mock('@google-cloud/firestore', () => {
  const snap = (data: Doc | undefined) => ({ exists: data !== undefined, data: () => data });
  class Query {
    constructor(
      private docs: Map<string, Doc>,
      private filters: Array<[string, unknown]> = [],
      private max = Infinity
    ) {}
    where(field: string, op: string, value: unknown) {
      if (op !== '==') throw new Error(`unsupported operator ${op}`);
      return new Query(this.docs, [...this.filters, [field, value]], this.max);
    }
    limit(n: number) {
      return new Query(this.docs, this.filters, n);
    }
    async get() {
      const docs = [...this.docs.values()]
        .filter((d) => this.filters.every(([f, v]) => d[f] === v))
        .slice(0, this.max)
        .map((d) => snap(d));
      return { empty: docs.length === 0, docs };
    }
  }
  class Collection extends Query {
    constructor(private store: Map<string, Doc>) {
      super(store);
    }
    doc(id: string) {
      if (id.includes('/')) throw new Error(`invalid document id ${id}`);
      const store = this.store;
      return {
        get: async () => snap(store.get(id)),
        set: async (data: Doc, opts?: { merge?: boolean }) => {
          for (const [k, v] of Object.entries(data)) {
            if (v === undefined) throw new Error(`Firestore rejects undefined (${k})`);
          }
          store.set(id, opts?.merge ? { ...store.get(id), ...data } : { ...data });
        },
        delete: async () => void store.delete(id),
      };
    }
  }
  class Firestore {
    constructor(options?: unknown) {
      firestoreOptions.push(options);
    }
    collection(name: string) {
      if (!collections.has(name)) collections.set(name, new Map());
      return new Collection(collections.get(name)!);
    }
  }
  return { Firestore };
});

const objects = new Map<string, Buffer>();
const storageCalls: unknown[] = [];

vi.mock('@google-cloud/storage', () => {
  class Storage {
    constructor(options?: unknown) {
      storageCalls.push(options);
    }
    bucket(name: string) {
      storageCalls.push(name);
      return {
        file: (key: string) => ({
          save: async (data: Buffer, opts: unknown) => {
            storageCalls.push(opts);
            objects.set(key, data);
          },
          download: async () => {
            if (key === 'explode') throw Object.assign(new Error('backend down'), { code: 503 });
            const data = objects.get(key);
            if (!data) throw Object.assign(new Error('No such object'), { code: 404 });
            return [data];
          },
          delete: async (opts: { ignoreNotFound?: boolean }) => {
            if (!objects.has(key) && !opts?.ignoreNotFound) {
              throw Object.assign(new Error('No such object'), { code: 404 });
            }
            objects.delete(key);
          },
        }),
      };
    }
  }
  return { Storage };
});

beforeEach(() => {
  collections.clear();
  objects.clear();
  firestoreOptions.length = 0;
  storageCalls.length = 0;
});

const stores: Array<[string, () => Promise<DataStore>]> = [
  ['MemoryStore', async () => new MemoryStore()],
  [
    'FirestoreStore',
    async () => new (await import('../src/store/firestore.js')).FirestoreStore('proj'),
  ],
];

describe.each(stores)('%s (DataStore contract)', (_name, make) => {
  let store: DataStore;
  beforeEach(async () => {
    store = await make();
  });

  it('creates users with an id and finds them by id and by email, any case', async () => {
    const user = await store.createUser({ id: '', email: 'pat@example.com', passwordHash: 'h' });
    expect(user.id).not.toBe('');
    expect(user.createdAt).toBeGreaterThan(0);
    expect(await store.getUserById(user.id)).toMatchObject({ email: 'pat@example.com', passwordHash: 'h' });
    expect((await store.getUserByEmail('PAT@example.com'))?.id).toBe(user.id);
    expect(await store.getUserById('missing')).toBeNull();
    expect(await store.getUserByEmail('missing@example.com')).toBeNull();
  });

  it('creates a social-login user with no password hash', async () => {
    const user = await store.createUser({ id: '', email: 'social@example.com' });
    expect((await store.getUserById(user.id))?.passwordHash).toBeUndefined();
  });

  it('patches a user and finds them by Stripe customer id', async () => {
    const user = await store.createUser({ id: '', email: 'pay@example.com' });
    expect(await store.getUserByStripeCustomerId('cus_1')).toBeNull();
    await store.updateUser(user.id, { stripeCustomerId: 'cus_1' });
    expect((await store.getUserByStripeCustomerId('cus_1'))?.id).toBe(user.id);
    expect((await store.getUserById(user.id))?.email).toBe('pay@example.com');
  });

  it('stores one license per user, replacing it wholesale', async () => {
    expect(await store.getLicense('u')).toBeNull();
    await store.putLicense({ userId: 'u', plan: 'annual', purchasedAt: 1, expiresAt: 2, refundedAt: 3 });
    await store.putLicense({ userId: 'u', plan: 'annual', purchasedAt: 4, expiresAt: 5 });
    expect(await store.getLicense('u')).toEqual({ userId: 'u', plan: 'annual', purchasedAt: 4, expiresAt: 5 });
  });

  it('stores one key envelope per user', async () => {
    expect(await store.getKeybag('u')).toBeNull();
    await store.putKeybag({ userId: 'u', envelope: 'e1', updatedAt: 1 });
    await store.putKeybag({ userId: 'u', envelope: 'e2', updatedAt: 2 });
    expect(await store.getKeybag('u')).toEqual({ userId: 'u', envelope: 'e2', updatedAt: 2 });
    expect(await store.getKeybag('other')).toBeNull();
  });

  it('keeps file metadata per user, newest first, and deletes it', async () => {
    const meta = (userId: string, id: string, savedAt: number) => ({ id, userId, name: 'n', size: 1, savedAt });
    await store.putFileMeta(meta('a', 'f1', 10));
    await store.putFileMeta(meta('a', 'f2', 30));
    await store.putFileMeta(meta('b', 'f1', 20));
    expect((await store.listFiles('a')).map((f) => f.id)).toEqual(['f2', 'f1']);
    expect((await store.listFiles('b')).map((f) => f.id)).toEqual(['f1']);
    expect(await store.getFileMeta('a', 'f1')).toMatchObject({ userId: 'a', savedAt: 10 });
    expect(await store.getFileMeta('a', 'nope')).toBeNull();

    await store.deleteFileMeta('a', 'f1');
    expect((await store.listFiles('a')).map((f) => f.id)).toEqual(['f2']);
    expect(await store.getFileMeta('b', 'f1')).not.toBeNull();
  });
});

describe('FirestoreStore', () => {
  it('passes the project id through, or lets the SDK discover it', async () => {
    const { FirestoreStore } = await import('../src/store/firestore.js');
    new FirestoreStore('my-project');
    new FirestoreStore();
    expect(firestoreOptions).toEqual([{ projectId: 'my-project' }, undefined]);
  });
});

describe('store selection in production', () => {
  it('uses Firestore and GCS when configured', async () => {
    vi.resetModules();
    const { config } = await import('../src/config.js');
    Object.assign(config, { dataBackend: 'firestore', gcpProject: 'proj', filesBucket: 'bucket' });
    const { getStore } = await import('../src/store/index.js');
    const { FirestoreStore } = await import('../src/store/firestore.js');
    expect(await getStore()).toBeInstanceOf(FirestoreStore);

    const { getBlobStore } = await import('../src/store/blobs.js');
    const blobs = getBlobStore();
    expect(getBlobStore()).toBe(blobs);
    await blobs.put('u/f', Buffer.from('x'));
    expect(storageCalls.slice(0, 2)).toEqual([{ projectId: 'proj' }, 'bucket']);
  });
});

describe('GCS blob store', () => {
  let blobs: BlobStore;
  beforeEach(async () => {
    vi.resetModules();
    const { config } = await import('../src/config.js');
    Object.assign(config, { filesBucket: 'bucket', gcpProject: '' });
    blobs = (await import('../src/store/blobs.js')).getBlobStore();
  });

  it('uploads opaque bytes non-resumably and reads them back', async () => {
    const data = Buffer.from([0, 255, 7]);
    await blobs.put('user/file', data);
    expect(storageCalls).toContainEqual({ contentType: 'application/octet-stream', resumable: false });
    expect(await blobs.get('user/file')).toEqual(data);
  });

  it('returns null for a missing object but surfaces real failures', async () => {
    expect(await blobs.get('user/missing')).toBeNull();
    await expect(blobs.get('explode')).rejects.toThrow('backend down');
  });

  it('deletes, and tolerates deleting what is already gone', async () => {
    await blobs.put('user/file', Buffer.from('x'));
    await blobs.delete('user/file');
    expect(await blobs.get('user/file')).toBeNull();
    await expect(blobs.delete('user/file')).resolves.toBeUndefined();
  });
});

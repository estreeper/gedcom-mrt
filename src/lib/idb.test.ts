import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checksum, saveSession, listSessions, loadSessionById, deleteSession } from './idb';

// Persistence against an in-memory IndexedDB (jsdom has none of its own).

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory(); // a fresh, empty database per test
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('checksum', () => {
  it('is the SHA-256 hex digest of the UTF-8 text', async () => {
    expect(await checksum('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
    expect(await checksum('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('distinguishes different content and is stable for the same content', async () => {
    expect(await checksum('0 HEAD\n')).toBe(await checksum('0 HEAD\n'));
    expect(await checksum('0 HEAD\n')).not.toBe(await checksum('0 HEAD\r\n'));
  });

  it.each([
    ['Web Crypto is missing', undefined],
    ['digest throws', { subtle: { digest: () => Promise.reject(new Error('no')) } }],
  ])('falls back to a cheap hash when %s', async (_name, crypto) => {
    vi.stubGlobal('crypto', crypto);
    const a = await checksum('hello');
    expect(a).toMatch(/^f[0-9a-f]+-5$/);
    expect(await checksum('hello')).toBe(a);
    expect(await checksum('hellp')).not.toBe(a);
  });
});

describe('saved sessions', () => {
  it('saves a file and loads it back by id', async () => {
    vi.useFakeTimers({ now: 5000, toFake: ['Date'] });
    await saveSession('abc', 'tree.ged', '0 HEAD\n0 TRLR\n');
    expect(await loadSessionById('abc')).toEqual({
      id: 'abc',
      checksum: 'abc',
      name: 'tree.ged',
      text: '0 HEAD\n0 TRLR\n',
      savedAt: 5000,
      size: 14,
    });
  });

  it('returns undefined for an unknown id', async () => {
    expect(await loadSessionById('nope')).toBeUndefined();
  });

  it('overwrites the same id rather than duplicating it', async () => {
    await saveSession('abc', 'tree.ged', 'v1');
    await saveSession('abc', 'tree.ged', 'v2 repaired');
    expect((await listSessions()).map((f) => f.id)).toEqual(['abc']);
    expect((await loadSessionById('abc'))?.text).toBe('v2 repaired');
  });

  it('keeps two different files with the same name apart', async () => {
    await saveSession('one', 'tree.ged', 'first');
    await saveSession('two', 'tree.ged', 'second');
    expect((await loadSessionById('one'))?.text).toBe('first');
    expect((await loadSessionById('two'))?.text).toBe('second');
  });

  it('lists metadata only, most recently saved first', async () => {
    vi.useFakeTimers({ now: 1000, toFake: ['Date'] });
    await saveSession('old', 'old.ged', 'aaaa');
    vi.setSystemTime(3000);
    await saveSession('new', 'new.ged', 'bb');
    vi.setSystemTime(2000);
    await saveSession('mid', 'mid.ged', 'c');

    const list = await listSessions();
    expect(list).toEqual([
      { id: 'new', checksum: 'new', name: 'new.ged', savedAt: 3000, size: 2 },
      { id: 'mid', checksum: 'mid', name: 'mid.ged', savedAt: 2000, size: 1 },
      { id: 'old', checksum: 'old', name: 'old.ged', savedAt: 1000, size: 4 },
    ]);
    expect(list.every((f) => !('text' in f))).toBe(true);
  });

  it('deletes one file and leaves the rest', async () => {
    await saveSession('a', 'a.ged', 'a');
    await saveSession('b', 'b.ged', 'b');
    await deleteSession('a');
    expect((await listSessions()).map((f) => f.id)).toEqual(['b']);
    expect(await loadSessionById('a')).toBeUndefined();
    await expect(deleteSession('a')).resolves.toBeUndefined(); // already gone
  });

  it('replaces a store left behind by an older schema', async () => {
    // An earlier version kept one row in a `session` store and keyed `files`
    // by name; opening at the current version must rebuild both.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('gedcom-mrt', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('session');
        req.result.createObjectStore('files', { keyPath: 'name' });
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });

    await saveSession('abc', 'tree.ged', 'text');
    expect((await listSessions()).map((f) => f.id)).toEqual(['abc']);
  });
});

describe('without IndexedDB', () => {
  beforeEach(() => {
    // @ts-expect-error simulating a browser/test environment with no IndexedDB
    delete globalThis.indexedDB;
  });

  it('degrades to no-ops instead of throwing', async () => {
    await expect(saveSession('a', 'a.ged', 'a')).resolves.toBeUndefined();
    expect(await listSessions()).toEqual([]);
    expect(await loadSessionById('a')).toBeUndefined();
    await expect(deleteSession('a')).resolves.toBeUndefined();
  });
});

describe('when IndexedDB fails', () => {
  beforeEach(() => {
    globalThis.indexedDB = {
      open: () => {
        const req = { error: new Error('blocked') } as unknown as IDBOpenDBRequest;
        queueMicrotask(() => req.onerror?.(new Event('error')));
        return req;
      },
    } as unknown as IDBFactory;
  });

  it('is best-effort: swallows the failure and reports nothing saved', async () => {
    await expect(saveSession('a', 'a.ged', 'a')).resolves.toBeUndefined();
    expect(await listSessions()).toEqual([]);
    expect(await loadSessionById('a')).toBeUndefined();
    await expect(deleteSession('a')).resolves.toBeUndefined();
  });
});

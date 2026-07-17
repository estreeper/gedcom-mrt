// Tiny IndexedDB wrapper that autosaves the working session (the current,
// repaired GEDCOM text plus its filename) so a reload restores where the user
// left off. We store the serialized text — not the parsed node tree — because
// the tree has parent cycles that structured-clone can't handle, and re-parsing
// on load is cheap (~100ms even for large files).

const DB_NAME = 'gedcom-mrt';
const STORE = 'session';
const KEY = 'current';

export interface Session {
  name: string;
  text: string;
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSession(session: Session): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(session, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Persistence is best-effort; ignore storage failures.
  }
}

export async function loadSession(): Promise<Session | undefined> {
  if (!hasIndexedDb()) return undefined;
  try {
    const db = await openDb();
    const session = await new Promise<Session | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as Session | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return session;
  } catch {
    return undefined;
  }
}

export async function clearSession(): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

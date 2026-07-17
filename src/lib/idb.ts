// IndexedDB storage for repaired GEDCOM sessions. Each file the user works on
// is autosaved (its serialized, repaired text) keyed by filename, so the start
// screen can list previously-opened files to re-open. We store text, not the
// parsed node tree (which has parent cycles structured-clone can't handle);
// re-parsing on open is cheap.

const DB_NAME = 'gedcom-mrt';
const STORE = 'files';
const LEGACY_STORE = 'session';
const VERSION = 2;

export interface SavedFile {
  name: string;
  text: string;
  savedAt: number;
  size: number;
}

export type FileMeta = Omit<SavedFile, 'text'>;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const tx = req.transaction;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'name' });
      }
      // Migrate the single legacy 'session'/'current' entry into the new store.
      if (tx && db.objectStoreNames.contains(LEGACY_STORE)) {
        const getReq = tx.objectStore(LEGACY_STORE).get('current');
        getReq.onsuccess = () => {
          const s = getReq.result;
          if (s && typeof s.name === 'string' && typeof s.text === 'string') {
            tx.objectStore(STORE).put({
              name: s.name,
              text: s.text,
              savedAt: Date.now(),
              size: s.text.length,
            });
          }
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Save (or overwrite) a file's repaired text under its name. Best-effort. */
export async function saveSession(name: string, text: string): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ name, text, savedAt: Date.now(), size: text.length });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore storage failures
  }
}

/** List saved files (metadata only), most-recently-saved first. */
export async function listSessions(): Promise<FileMeta[]> {
  if (!hasIndexedDb()) return [];
  try {
    const db = await openDb();
    const metas = await new Promise<FileMeta[]>((resolve, reject) => {
      const out: FileMeta[] = [];
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          const v = cursor.value as SavedFile;
          out.push({ name: v.name, savedAt: v.savedAt ?? 0, size: v.size ?? 0 });
          cursor.continue();
        } else {
          resolve(out);
        }
      };
      req.onerror = () => reject(req.error);
    });
    db.close();
    return metas.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/** Load a saved file (with its text) by name. */
export async function loadSessionByName(
  name: string
): Promise<SavedFile | undefined> {
  if (!hasIndexedDb()) return undefined;
  try {
    const db = await openDb();
    const file = await new Promise<SavedFile | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(name);
      req.onsuccess = () => resolve(req.result as SavedFile | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return file;
  } catch {
    return undefined;
  }
}

/** Delete a saved file by name. Best-effort. */
export async function deleteSession(name: string): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

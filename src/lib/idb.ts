// IndexedDB storage for repaired GEDCOM sessions. Each file the user works on
// is autosaved (its serialized, repaired text) so the start screen can list
// previously-opened files to re-open. We store text, not the parsed node tree
// (which has parent cycles structured-clone can't handle); re-parsing is cheap.
//
// Entries are keyed by a CHECKSUM of the *original* uploaded content, so:
//   - two different files with the same name are kept separately (no overwrite);
//   - re-uploading identical content is detected as a duplicate (see checksum).

const DB_NAME = 'gedcom-mrt';
const STORE = 'files';
const LEGACY_STORE = 'session';
const VERSION = 3;

export interface SavedFile {
  /** Key: checksum of the original uploaded content. */
  id: string;
  checksum: string;
  name: string;
  /** Current (repaired) GEDCOM text. */
  text: string;
  savedAt: number;
  size: number;
}

export type FileMeta = Omit<SavedFile, 'text'>;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * Checksum of a file's content, used both as the storage key and to detect
 * duplicate uploads. Prefers SHA-256 (Web Crypto); falls back to a cheap
 * string hash where Web Crypto is unavailable (e.g. some test environments).
 */
export async function checksum(text: string): Promise<string> {
  const c: Crypto | undefined = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.subtle && typeof TextEncoder !== 'undefined') {
    try {
      const data = new TextEncoder().encode(text);
      const buf = await c.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // fall through to the cheap hash
    }
  }
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return `f${h.toString(16)}-${text.length}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // The store is keyed by checksum id; recreate if an older keyPath exists.
      if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE);
      db.createObjectStore(STORE, { keyPath: 'id' });
      if (db.objectStoreNames.contains(LEGACY_STORE)) {
        db.deleteObjectStore(LEGACY_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Save (or update) a file's repaired text under its checksum id. Best-effort. */
export async function saveSession(
  id: string,
  name: string,
  text: string
): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({
        id,
        checksum: id,
        name,
        text,
        savedAt: Date.now(),
        size: text.length,
      });
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
          out.push({
            id: v.id,
            checksum: v.checksum,
            name: v.name,
            savedAt: v.savedAt ?? 0,
            size: v.size ?? 0,
          });
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

/** Load a saved file (with its text) by its checksum id. */
export async function loadSessionById(
  id: string
): Promise<SavedFile | undefined> {
  if (!hasIndexedDb()) return undefined;
  try {
    const db = await openDb();
    const file = await new Promise<SavedFile | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as SavedFile | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return file;
  } catch {
    return undefined;
  }
}

/** Delete a saved file by its checksum id. Best-effort. */
export async function deleteSession(id: string): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

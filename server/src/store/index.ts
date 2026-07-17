import { config } from '../config.js';
import type { DataStore } from './types.js';
import { MemoryStore } from './memory.js';

let store: DataStore | undefined;

/** Lazily construct the configured DataStore (singleton). */
export async function getStore(): Promise<DataStore> {
  if (store) return store;
  if (config.dataBackend === 'firestore') {
    // Imported dynamically so local/test runs don't need the GCP SDK wired up.
    const { FirestoreStore } = await import('./firestore.js');
    store = new FirestoreStore(config.gcpProject || undefined);
  } else {
    store = new MemoryStore();
  }
  return store;
}

/** Test hook: inject a store (e.g. a fresh MemoryStore per test). */
export function setStore(s: DataStore): void {
  store = s;
}

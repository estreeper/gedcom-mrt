import { api, ApiError } from './api';
import {
  KeyEnvelope,
  encryptText,
  decryptText,
  encryptToBase64,
  decryptFromBase64,
} from './crypto/keys';

// Client for zero-knowledge cloud storage. Mirrors the shape of idb.ts, but the
// text is AES-GCM encrypted with the in-memory DEK before it leaves the browser,
// and the server only ever sees ciphertext + an encrypted filename. The DEK is
// never sent — see CloudKeyStore.

export interface CloudFileMeta {
  id: string;
  /** Decrypted (plaintext) filename. */
  name: string;
  size: number;
  savedAt: number;
}

interface RawFileMeta {
  id: string;
  name: string; // encrypted (base64)
  size: number;
  savedAt: number;
}

// --- key envelope ----------------------------------------------------------

/** Fetch the stored key envelope, or null if the user hasn't set one up. */
export async function getKeyEnvelope(): Promise<KeyEnvelope | null> {
  try {
    const res = await api.get<{ envelope: string }>('/keybag');
    return JSON.parse(res.envelope) as KeyEnvelope;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function putKeyEnvelope(envelope: KeyEnvelope): Promise<void> {
  await api.put('/keybag', {
    json: { envelope: JSON.stringify(envelope) },
    parse: 'none',
  });
}

// --- files -----------------------------------------------------------------

export async function listCloud(dek: CryptoKey): Promise<CloudFileMeta[]> {
  const { files } = await api.get<{ files: RawFileMeta[] }>('/files');
  const out: CloudFileMeta[] = [];
  for (const f of files) {
    let name = '(encrypted)';
    try {
      name = await decryptFromBase64(dek, f.name);
    } catch {
      // Name encrypted with a different key; leave placeholder.
    }
    out.push({ id: f.id, name, size: f.size, savedAt: f.savedAt });
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

export async function saveCloud(
  id: string,
  name: string,
  text: string,
  dek: CryptoKey
): Promise<void> {
  const encName = await encryptToBase64(dek, name);
  const blob = await encryptText(dek, text);
  await api.put(`/files/${encodeURIComponent(id)}`, {
    body: blob,
    headers: {
      'content-type': 'application/octet-stream',
      'x-file-name': encName,
    },
    parse: 'none',
  });
}

/** Download and decrypt a cloud file's text. */
export async function loadCloudText(id: string, dek: CryptoKey): Promise<string> {
  const buf = await api.get<ArrayBuffer>(`/files/${encodeURIComponent(id)}`, {
    parse: 'arrayBuffer',
  });
  return decryptText(dek, new Uint8Array(buf));
}

export async function deleteCloud(id: string): Promise<void> {
  await api.del(`/files/${encodeURIComponent(id)}`, { parse: 'none' });
}

// Zero-knowledge key management for encrypted cloud storage. All crypto uses the
// browser's Web Crypto (`crypto.subtle`) — the same API already used for
// checksums in idb.ts. Envelope scheme:
//
//   DEK  (Data Encryption Key)  — random AES-256-GCM key that encrypts files.
//   KEK  (Key Encryption Key)   — derived from the user's passphrase via PBKDF2.
//   The DEK is wrapped by the KEK, and ALSO by a KEK derived from a one-time
//   recovery key. The server only ever stores the wrapped DEKs (the "envelope")
//   plus KDF params — never the passphrase, KEK, DEK, or plaintext.
//
// This is decoupled from the login method, so email/password and social-login
// users work identically: the passphrase is an independent secret.

const PBKDF2_ITERATIONS = 250_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface WrappedKey {
  salt: string; // base64
  iv: string; // base64
  iterations: number;
  wrappedDEK: string; // base64
}

export interface KeyEnvelope {
  v: 1;
  passphrase: WrappedKey;
  recovery: WrappedKey;
}

function subtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) throw new Error('Web Crypto is not available in this browser.');
  return c.subtle;
}

// Note: allocate on an explicit ArrayBuffer (not the default ArrayBufferLike) so
// these satisfy Web Crypto's BufferSource / fetch's BodyInit under TS's typed
// typed-arrays.
function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(n));
  crypto.getRandomValues(out);
  return out;
}

function utf8(s: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new TextEncoder().encode(s));
}

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Derive an AES-GCM key-wrapping key (KEK) from a secret string. */
async function deriveKEK(
  secret: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', utf8(secret), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

async function generateDEK(): Promise<CryptoKey> {
  return subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

async function wrapWith(secret: string, dek: CryptoKey): Promise<WrappedKey> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const kek = await deriveKEK(secret, salt, PBKDF2_ITERATIONS);
  const wrapped = await subtle().wrapKey('raw', dek, kek, { name: 'AES-GCM', iv });
  return {
    salt: toBase64(salt),
    iv: toBase64(iv),
    iterations: PBKDF2_ITERATIONS,
    wrappedDEK: toBase64(wrapped),
  };
}

async function unwrapWith(secret: string, wk: WrappedKey): Promise<CryptoKey> {
  const kek = await deriveKEK(secret, fromBase64(wk.salt), wk.iterations);
  return subtle().unwrapKey(
    'raw',
    fromBase64(wk.wrappedDEK),
    kek,
    { name: 'AES-GCM', iv: fromBase64(wk.iv) },
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/** A human-transcribable recovery key (base32-ish groups). */
export function generateRecoveryKey(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
  const bytes = randomBytes(20);
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += alphabet[bytes[i] % alphabet.length];
    if ((i + 1) % 5 === 0 && i < bytes.length - 1) s += '-';
  }
  return s;
}

/**
 * Set up encryption for a user: a fresh DEK wrapped by the passphrase and by a
 * newly generated recovery key. Returns the DEK (held in memory) plus the
 * envelope (stored server-side) and the recovery key (shown to the user once).
 */
export async function createEnvelope(passphrase: string): Promise<{
  dek: CryptoKey;
  envelope: KeyEnvelope;
  recoveryKey: string;
}> {
  const dek = await generateDEK();
  const recoveryKey = generateRecoveryKey();
  const envelope: KeyEnvelope = {
    v: 1,
    passphrase: await wrapWith(passphrase, dek),
    recovery: await wrapWith(recoveryKey, dek),
  };
  return { dek, envelope, recoveryKey };
}

export async function unlockWithPassphrase(
  envelope: KeyEnvelope,
  passphrase: string
): Promise<CryptoKey | null> {
  try {
    return await unwrapWith(passphrase, envelope.passphrase);
  } catch {
    return null; // wrong passphrase (GCM auth tag mismatch)
  }
}

export async function unlockWithRecovery(
  envelope: KeyEnvelope,
  recoveryKey: string
): Promise<CryptoKey | null> {
  try {
    return await unwrapWith(recoveryKey.trim().toUpperCase(), envelope.recovery);
  } catch {
    return null;
  }
}

/**
 * Re-wrap an already-unlocked DEK under a new passphrase (used after a recovery
 * unlock so the user can set a new passphrase). Keeps the same recovery key
 * wrap unless a new recovery key is provided.
 */
export async function rewrapPassphrase(
  dek: CryptoKey,
  newPassphrase: string,
  recovery: WrappedKey
): Promise<KeyEnvelope> {
  return { v: 1, passphrase: await wrapWith(newPassphrase, dek), recovery };
}

/** AES-GCM encrypt UTF-8 text with the DEK. Output: iv(12) || ciphertext. */
export async function encryptText(
  dek: CryptoKey,
  text: string
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = randomBytes(IV_BYTES);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, dek, utf8(text));
  const out = new Uint8Array(new ArrayBuffer(iv.length + ct.byteLength));
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return out;
}

/** Inverse of encryptText. */
export async function decryptText(
  dek: CryptoKey,
  blob: Uint8Array<ArrayBuffer>
): Promise<string> {
  const iv = blob.subarray(0, IV_BYTES);
  const ct = blob.subarray(IV_BYTES);
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv }, dek, ct);
  return new TextDecoder().decode(pt);
}

/** Encrypt a short string (e.g. a filename) → base64 for a header/metadata. */
export async function encryptToBase64(dek: CryptoKey, text: string): Promise<string> {
  return toBase64(await encryptText(dek, text));
}

export async function decryptFromBase64(dek: CryptoKey, b64: string): Promise<string> {
  return decryptText(dek, fromBase64(b64));
}

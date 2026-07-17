// Data model + the storage interface the routes depend on. Two implementations:
// an in-memory store (local dev / tests) and a Firestore-backed store (prod).
// Ciphertext blobs live in GCS, referenced by file metadata here.

export interface User {
  id: string;
  email: string;
  /** bcrypt hash; undefined for accounts created via social login only. */
  passwordHash?: string;
  /** Set once we create a Stripe customer for this user. */
  stripeCustomerId?: string;
  createdAt: number;
}

export type LicenseStatus = 'active' | 'expired' | 'refunded' | 'none';

export interface License {
  userId: string;
  plan: 'annual';
  purchasedAt: number;
  /** Epoch ms when access ends. */
  expiresAt: number;
  refundedAt?: number;
  stripeSessionId?: string;
  stripeCustomerId?: string;
}

/** Opaque, server-unreadable key envelope for zero-knowledge file encryption. */
export interface Keybag {
  userId: string;
  /** JSON blob produced by the client: wrapped DEK, salt, iterations, recovery. */
  envelope: string;
  updatedAt: number;
}

export interface FileMeta {
  id: string;
  userId: string;
  /** Encrypted filename (base64) — the server never sees the plaintext name. */
  name: string;
  size: number;
  savedAt: number;
}

export interface DataStore {
  // accounts
  createUser(user: Omit<User, 'createdAt'>): Promise<User>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserByStripeCustomerId(customerId: string): Promise<User | null>;
  updateUser(id: string, patch: Partial<User>): Promise<void>;

  // licensing
  getLicense(userId: string): Promise<License | null>;
  putLicense(license: License): Promise<void>;

  // zero-knowledge key envelope (Phase 4)
  getKeybag(userId: string): Promise<Keybag | null>;
  putKeybag(keybag: Keybag): Promise<void>;

  // encrypted file metadata (blobs are in object storage; Phase 4)
  listFiles(userId: string): Promise<FileMeta[]>;
  getFileMeta(userId: string, id: string): Promise<FileMeta | null>;
  putFileMeta(meta: FileMeta): Promise<void>;
  deleteFileMeta(userId: string, id: string): Promise<void>;
}

/** Derive the current status of a license (or lack of one). */
export function licenseStatus(
  license: License | null,
  now: number
): LicenseStatus {
  if (!license) return 'none';
  if (license.refundedAt) return 'refunded';
  if (license.expiresAt <= now) return 'expired';
  return 'active';
}

import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import type {
  DataStore,
  User,
  License,
  Keybag,
  FileMeta,
} from './types.js';

// Firestore-backed DataStore for production. Serverless, scales to zero, no VPC
// connector needed from Cloud Run. Ciphertext blobs are NOT stored here (they
// go to GCS); only their metadata is. Collections:
//   users/{id}, licenses/{userId}, keybags/{userId}, files/{userId__id}

export class FirestoreStore implements DataStore {
  private db: Firestore;

  constructor(projectId?: string) {
    this.db = new Firestore(projectId ? { projectId } : undefined);
  }

  async createUser(user: Omit<User, 'createdAt'>): Promise<User> {
    const full: User = {
      ...user,
      id: user.id || randomUUID(),
      createdAt: Date.now(),
    };
    await this.db.collection('users').doc(full.id).set(stripUndefined(full));
    return full;
  }

  async getUserById(id: string): Promise<User | null> {
    const snap = await this.db.collection('users').doc(id).get();
    return snap.exists ? (snap.data() as User) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const q = await this.db
      .collection('users')
      .where('email', '==', email.toLowerCase())
      .limit(1)
      .get();
    return q.empty ? null : (q.docs[0].data() as User);
  }

  async getUserByStripeCustomerId(customerId: string): Promise<User | null> {
    const q = await this.db
      .collection('users')
      .where('stripeCustomerId', '==', customerId)
      .limit(1)
      .get();
    return q.empty ? null : (q.docs[0].data() as User);
  }

  async updateUser(id: string, patch: Partial<User>): Promise<void> {
    await this.db.collection('users').doc(id).set(stripUndefined(patch), { merge: true });
  }

  async getLicense(userId: string): Promise<License | null> {
    const snap = await this.db.collection('licenses').doc(userId).get();
    return snap.exists ? (snap.data() as License) : null;
  }

  async putLicense(license: License): Promise<void> {
    await this.db
      .collection('licenses')
      .doc(license.userId)
      .set(stripUndefined(license));
  }

  async getKeybag(userId: string): Promise<Keybag | null> {
    const snap = await this.db.collection('keybags').doc(userId).get();
    return snap.exists ? (snap.data() as Keybag) : null;
  }

  async putKeybag(keybag: Keybag): Promise<void> {
    await this.db.collection('keybags').doc(keybag.userId).set(keybag);
  }

  async listFiles(userId: string): Promise<FileMeta[]> {
    const q = await this.db
      .collection('files')
      .where('userId', '==', userId)
      .get();
    return q.docs
      .map((d) => d.data() as FileMeta)
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  async getFileMeta(userId: string, id: string): Promise<FileMeta | null> {
    const snap = await this.db.collection('files').doc(`${userId}__${id}`).get();
    return snap.exists ? (snap.data() as FileMeta) : null;
  }

  async putFileMeta(meta: FileMeta): Promise<void> {
    await this.db.collection('files').doc(`${meta.userId}__${meta.id}`).set(meta);
  }

  async deleteFileMeta(userId: string, id: string): Promise<void> {
    await this.db.collection('files').doc(`${userId}__${id}`).delete();
  }
}

/** Firestore rejects `undefined` field values; drop them. */
function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

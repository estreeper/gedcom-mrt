import { randomUUID } from 'node:crypto';
import type {
  DataStore,
  User,
  License,
  Keybag,
  FileMeta,
} from './types.js';

// In-memory DataStore for local development and tests. Not persistent — every
// restart is a clean slate. Production uses the Firestore store.

export class MemoryStore implements DataStore {
  private users = new Map<string, User>();
  private byEmail = new Map<string, string>(); // lower(email) -> id
  private licenses = new Map<string, License>();
  private keybags = new Map<string, Keybag>();
  private files = new Map<string, FileMeta>(); // `${userId}/${id}` -> meta

  async createUser(user: Omit<User, 'createdAt'>): Promise<User> {
    const full: User = { ...user, id: user.id || randomUUID(), createdAt: Date.now() };
    this.users.set(full.id, full);
    this.byEmail.set(full.email.toLowerCase(), full.id);
    return full;
  }

  async getUserById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const id = this.byEmail.get(email.toLowerCase());
    return id ? (this.users.get(id) ?? null) : null;
  }

  async getUserByStripeCustomerId(customerId: string): Promise<User | null> {
    for (const u of this.users.values()) {
      if (u.stripeCustomerId === customerId) return u;
    }
    return null;
  }

  async updateUser(id: string, patch: Partial<User>): Promise<void> {
    const cur = this.users.get(id);
    if (!cur) return;
    const next = { ...cur, ...patch };
    this.users.set(id, next);
    if (patch.email && patch.email !== cur.email) {
      this.byEmail.delete(cur.email.toLowerCase());
      this.byEmail.set(next.email.toLowerCase(), id);
    }
  }

  async getLicense(userId: string): Promise<License | null> {
    return this.licenses.get(userId) ?? null;
  }

  async putLicense(license: License): Promise<void> {
    this.licenses.set(license.userId, license);
  }

  async getKeybag(userId: string): Promise<Keybag | null> {
    return this.keybags.get(userId) ?? null;
  }

  async putKeybag(keybag: Keybag): Promise<void> {
    this.keybags.set(keybag.userId, keybag);
  }

  async listFiles(userId: string): Promise<FileMeta[]> {
    return [...this.files.values()]
      .filter((f) => f.userId === userId)
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  async getFileMeta(userId: string, id: string): Promise<FileMeta | null> {
    return this.files.get(`${userId}/${id}`) ?? null;
  }

  async putFileMeta(meta: FileMeta): Promise<void> {
    this.files.set(`${meta.userId}/${meta.id}`, meta);
  }

  async deleteFileMeta(userId: string, id: string): Promise<void> {
    this.files.delete(`${userId}/${id}`);
  }
}

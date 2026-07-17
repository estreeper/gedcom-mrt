import { config } from '../config.js';

// Ciphertext blob storage. The bytes here are ALWAYS client-side-encrypted; the
// server cannot read them. GCS in production, in-memory for local dev/tests.

export interface BlobStore {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

export class MemoryBlobStore implements BlobStore {
  private blobs = new Map<string, Buffer>();
  async put(key: string, data: Buffer): Promise<void> {
    this.blobs.set(key, data);
  }
  async get(key: string): Promise<Buffer | null> {
    return this.blobs.get(key) ?? null;
  }
  async delete(key: string): Promise<void> {
    this.blobs.delete(key);
  }
}

class GcsBlobStore implements BlobStore {
  private bucketPromise: Promise<import('@google-cloud/storage').Bucket>;
  constructor(bucketName: string, projectId?: string) {
    this.bucketPromise = import('@google-cloud/storage').then(
      ({ Storage }) =>
        new Storage(projectId ? { projectId } : undefined).bucket(bucketName)
    );
  }
  async put(key: string, data: Buffer): Promise<void> {
    const bucket = await this.bucketPromise;
    await bucket.file(key).save(data, {
      contentType: 'application/octet-stream',
      resumable: false,
    });
  }
  async get(key: string): Promise<Buffer | null> {
    const bucket = await this.bucketPromise;
    try {
      const [data] = await bucket.file(key).download();
      return data;
    } catch (err) {
      if ((err as { code?: number }).code === 404) return null;
      throw err;
    }
  }
  async delete(key: string): Promise<void> {
    const bucket = await this.bucketPromise;
    await bucket.file(key).delete({ ignoreNotFound: true });
  }
}

let blobStore: BlobStore | undefined;

export function getBlobStore(): BlobStore {
  if (!blobStore) {
    blobStore = config.filesBucket
      ? new GcsBlobStore(config.filesBucket, config.gcpProject || undefined)
      : new MemoryBlobStore();
  }
  return blobStore;
}

/** Test hook. */
export function setBlobStore(s: BlobStore): void {
  blobStore = s;
}

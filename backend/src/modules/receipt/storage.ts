import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';

export interface ReceiptStorage {
  upload(key: string, buffer: Buffer, mimeType: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export class LocalReceiptStorage implements ReceiptStorage {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.resolve(process.cwd(), 'uploads', 'receipts');
  }

  async upload(key: string, buffer: Buffer, _mimeType: string): Promise<string> {
    const fullPath = path.join(this.baseDir, key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return `/uploads/receipts/${key}`;
  }

  async get(key: string): Promise<Buffer> {
    const fullPath = path.join(this.baseDir, key);
    return await fs.readFile(fullPath);
  }

  async delete(key: string): Promise<void> {
    const fullPath = path.join(this.baseDir, key);
    try {
      await fs.unlink(fullPath);
    } catch {
      // file might not exist
    }
  }
}

export class S3ReceiptStorage implements ReceiptStorage {
  constructor(
    private readonly endpoint: string,
    private readonly bucket: string,
    private readonly accessKey: string,
    private readonly secretKey: string,
  ) {}

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    // S3 / Cloudflare R2 REST PUT implementation
    const url = `${this.endpoint.replace(/\/$/, '')}/${this.bucket}/${key}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
      },
      body: new Uint8Array(buffer),
    });
    if (!res.ok) {
      throw new Error(`Gagal upload ke S3/R2 (${res.status}): ${await res.text()}`);
    }
    return url;
  }

  async get(key: string): Promise<Buffer> {
    const url = `${this.endpoint.replace(/\/$/, '')}/${this.bucket}/${key}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Gagal mengambil gambar dari S3/R2 (${res.status})`);
    }
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  }

  async delete(key: string): Promise<void> {
    const url = `${this.endpoint.replace(/\/$/, '')}/${this.bucket}/${key}`;
    await fetch(url, { method: 'DELETE' });
  }
}

export function createReceiptStorage(): ReceiptStorage {
  if (
    process.env.STORAGE_ENDPOINT &&
    process.env.STORAGE_BUCKET_NAME &&
    process.env.STORAGE_ACCESS_KEY &&
    process.env.STORAGE_SECRET_KEY
  ) {
    return new S3ReceiptStorage(
      process.env.STORAGE_ENDPOINT,
      process.env.STORAGE_BUCKET_NAME,
      process.env.STORAGE_ACCESS_KEY,
      process.env.STORAGE_SECRET_KEY,
    );
  }
  return new LocalReceiptStorage();
}

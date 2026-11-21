import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** A URL the client can fetch. Private buckets return a short-lived signed URL. */
  url(key: string, opts?: { downloadName?: string; expiresInSec?: number }): Promise<string>;
  remove(keys: string[]): Promise<void>;
}

/**
 * The address the current request came in on (e.g. a Cloudflare tunnel URL), so links to
 * local files work no matter which address the phone used. Set per request in app.ts.
 */
export const requestBase = new AsyncLocalStorage<string>();

class LocalStorage implements Storage {
  root = path.resolve(config.localStorageDir);
  async put(key: string, data: Buffer) {
    const p = path.join(this.root, key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data);
  }
  async get(key: string) {
    return readFile(path.join(this.root, key));
  }
  async url(key: string, opts?: { downloadName?: string }) {
    const base = config.publicBaseUrl === 'auto' ? requestBase.getStore() ?? `http://localhost:${config.port}` : config.publicBaseUrl;
    const u = new URL(`/files/${key}`, base);
    if (opts?.downloadName) u.searchParams.set('download', opts.downloadName);
    return u.toString();
  }
  async remove(keys: string[]) {
    await Promise.all(keys.map((k) => unlink(path.join(this.root, k)).catch(() => {})));
  }
}

class SupabaseStorage implements Storage {
  private sb = createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false } });
  private bucket = () => this.sb.storage.from(config.storageBucket);

  async put(key: string, data: Buffer, contentType: string) {
    const { error } = await this.bucket().upload(key, data, { contentType, upsert: true });
    if (error) throw error;
  }
  async get(key: string) {
    const { data, error } = await this.bucket().download(key);
    if (error) throw error;
    return Buffer.from(await data.arrayBuffer());
  }
  async url(key: string, opts?: { downloadName?: string; expiresInSec?: number }) {
    const { data, error } = await this.bucket().createSignedUrl(key, opts?.expiresInSec ?? 3600, {
      download: opts?.downloadName ?? false,
    });
    if (error) throw error;
    return data.signedUrl;
  }
  async remove(keys: string[]) {
    if (keys.length) await this.bucket().remove(keys);
  }
}

export const storage: Storage = config.storageDriver === 'supabase' ? new SupabaseStorage() : new LocalStorage();
export const localStorageRoot = path.resolve(config.localStorageDir);

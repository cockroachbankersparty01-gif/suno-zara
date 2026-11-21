import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  // Keep small: the API (Render) and the GPU worker (Kaggle) share Supabase's free-tier connection limit.
  max: Number(process.env.DB_POOL_MAX ?? 5),
  ssl: config.databaseUrl.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
});

export async function query<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

export async function one<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const r = await pool.query<T>(text, params);
  return r.rows[0] ?? null;
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { one, pool } from './db.js';

/**
 * First-boot setup so nobody has to paste SQL on a phone:
 *  1. creates the database tables if they don't exist yet
 *  2. creates the private storage bucket on Supabase
 * Safe to run on every start.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_CANDIDATES = [
  path.resolve(here, '../../supabase/migrations/0001_init.sql'), // repo layout (src/ or dist/)
  path.resolve(process.cwd(), '../supabase/migrations/0001_init.sql'),
  path.resolve(process.cwd(), 'supabase/migrations/0001_init.sql'),
];

async function ensureDatabase() {
  const exists = await one<{ t: string | null }>(`select to_regclass('public.profiles')::text as t`);
  if (exists?.t) return;

  const file = MIGRATION_CANDIDATES.find((p) => existsSync(p));
  if (!file) throw new Error(`Database is empty and the schema file wasn't found (looked in ${MIGRATION_CANDIDATES.join(', ')})`);

  // Plain Postgres (local dev / CI) has no Supabase auth schema — add the small stub first.
  const hasAuth = await one<{ t: string | null }>(`select to_regclass('auth.users')::text as t`);
  if (!hasAuth?.t) {
    const stub = path.resolve(path.dirname(file), '../dev_auth_stub.sql');
    console.log('setup: no auth schema found — installing dev auth stub');
    await pool.query(readFileSync(stub, 'utf8'));
  }

  console.log(`setup: creating database tables from ${path.basename(file)}…`);
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(readFileSync(file, 'utf8'));
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  console.log('setup: database ready ✅');
}

async function ensureBucket() {
  if (config.storageDriver !== 'supabase') return;
  const sb = createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false } });
  const { data } = await sb.storage.getBucket(config.storageBucket);
  if (data) return;
  const { error } = await sb.storage.createBucket(config.storageBucket, { public: false });
  if (error && !/already exists/i.test(error.message)) throw error;
  console.log(`setup: created private storage bucket "${config.storageBucket}" ✅`);
}

function checkConfig() {
  const problems: string[] = [];
  if (config.authMode === 'supabase') {
    if (!config.supabaseUrl) problems.push('SUPABASE_URL is empty');
    if (!config.supabaseAnonKey) problems.push('SUPABASE_ANON_KEY is empty');
    if (!config.supabaseServiceKey) problems.push('SUPABASE_SERVICE_ROLE_KEY is empty');
  }
  if (config.storageDriver === 'supabase' && !config.supabaseServiceKey) problems.push('SUPABASE_SERVICE_ROLE_KEY is needed for storage');
  if (problems.length) throw new Error(`Configuration problem: ${problems.join('; ')}`);
}

export async function ensureSetup() {
  checkConfig();
  await ensureDatabase();
  await ensureBucket();
}

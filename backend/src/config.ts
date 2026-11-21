import 'dotenv/config';

/**
 * Values are often pasted from a notes app on a phone, so forgive the usual slips:
 * surrounding spaces/quotes, or the label pasted along with the value ("DATABASE_URL = postgres://…").
 */
export function cleanEnvValue(name: string, raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  let v = raw.trim();
  const label = new RegExp(`^${name}\\s*[:=]\\s*`, 'i');
  v = v.replace(label, '').trim();
  v = v.replace(/^["'`]+|["'`]+$/g, '').trim();
  return v;
}
for (const k of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'PUBLIC_BASE_URL']) {
  if (process.env[k] !== undefined) process.env[k] = cleanEnvValue(k, process.env[k]);
}

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing env var ${name}`);
  return v;
}
const int = (name: string, fallback: number) => Number(process.env[name] ?? fallback);

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: int('PORT', 4000),
  /** 'auto' = use whatever address each request arrived on (best with tunnels). */
  publicBaseUrl: req('PUBLIC_BASE_URL', 'auto'),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:8081').split(','),

  databaseUrl: req('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/postgres'),

  /** 'supabase' verifies real Supabase JWTs. 'dev' accepts `Bearer dev:<uuid>` — never use in production. */
  authMode: (process.env.AUTH_MODE ?? 'dev') as 'supabase' | 'dev',
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  /** Public anon key — safe to share with the apps (they use it to sign in). */
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',

  /** 'local' writes to ./storage and serves /files. 'supabase' uses a private bucket + signed URLs. */
  storageDriver: (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 'supabase',
  storageBucket: process.env.STORAGE_BUCKET ?? 'media',
  localStorageDir: process.env.LOCAL_STORAGE_DIR ?? './storage',

  /** mock | acestep (ACE-Step 1.5, MIT-licensed, self-hosted) */
  musicProvider: process.env.MUSIC_PROVIDER ?? 'mock',
  acestep: {
    url: process.env.ACESTEP_URL ?? 'http://localhost:8001',
    apiKey: process.env.ACESTEP_API_KEY ?? '',
  },
  /** mock | openai (any OpenAI-compatible endpoint: Ollama locally, or a free tier like Groq) */
  lyricsProvider: process.env.LYRICS_PROVIDER ?? 'mock',
  llm: {
    baseUrl: process.env.LLM_BASE_URL ?? 'http://localhost:11434/v1', // Ollama default
    apiKey: process.env.LLM_API_KEY ?? 'ollama',
    model: process.env.LLM_MODEL ?? 'llama3.2',
  },
  /** mock | pollinations (free, no key) */
  imageProvider: process.env.IMAGE_PROVIDER ?? 'mock',
  pollinationsToken: process.env.POLLINATIONS_TOKEN ?? '',
  ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',

  /** Everything is free. Credits are only a daily fair-use quota to share limited GPU time. */
  credits: {
    unlimited: process.env.UNLIMITED_CREDITS === 'true',
    dailyFree: int('CREDITS_DAILY_FREE', 50),
    perGeneration: int('CREDITS_PER_GENERATION', 10), // covers both variations
    perCoverArt: int('CREDITS_PER_COVER', 2),
  },
  limits: {
    maxActiveGenerations: int('MAX_ACTIVE_GENERATIONS', 2),
    generationsPerMinute: int('GENERATIONS_PER_MINUTE', 6),
    requestsPerMinute: int('REQUESTS_PER_MINUTE', 120),
    defaultDurationSec: int('DEFAULT_DURATION_SEC', 120),
    extendBySec: int('EXTEND_BY_SEC', 30),
    maxDurationSec: int('MAX_DURATION_SEC', 240),
  },
  tosVersion: process.env.TOS_VERSION ?? '2026-11-01',
};

if (config.env === 'production' && config.authMode === 'dev') {
  throw new Error('AUTH_MODE=dev is not allowed in production');
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { config } from './config.js';
import { pool } from './db.js';
import { errorHandler } from './lib/errors.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { optionalAuth } from './middleware/auth.js';
import { ai } from './routes/ai.js';
import { generations } from './routes/generations.js';
import { social } from './routes/social.js';
import { songs } from './routes/songs.js';
import { localStorageRoot, requestBase } from './services/storage.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '200kb' }));
  // Remember this request's public address (honours X-Forwarded-* from tunnels/proxies).
  app.use((req, _res, next) => requestBase.run(`${req.protocol}://${req.get('host')}`, next));

  app.get('/health', (_req, res) => res.json({ ok: true, provider: config.musicProvider }));

  // Public health/status summary for troubleshooting. Never includes keys, user data or prompts.
  app.get('/status', async (_req, res) => {
    const scrub = (t: string | null) =>
      (t ?? '').replace(/(sb_secret_|sb_publishable_|Bearer\s+)[\w-]+/gi, '$1***').replace(/postgres(ql)?:\/\/\S+/gi, 'postgres://***').slice(0, 300);
    try {
      const counts = await pool.query(
        `select status, count(*)::int as n from generations where created_at > now() - interval '7 days' group by status`,
      );
      const recent = await pool.query(
        `select status, attempts, status_text, error, created_at, completed_at from generations order by created_at desc limit 5`,
      );
      res.json({
        ok: true,
        musicProvider: config.musicProvider,
        deapiKeySet: !!process.env.DEAPI_API_KEY?.trim(),
        runWorker: process.env.RUN_WORKER !== 'false',
        ffmpeg: config.ffmpegPath !== 'ffmpeg' ? 'bundled' : 'system',
        last7Days: Object.fromEntries(counts.rows.map((r: any) => [r.status, r.n])),
        recent: recent.rows.map((r: any) => ({
          status: r.status, attempts: r.attempts, statusText: r.status_text, error: scrub(r.error),
          createdAt: r.created_at, completedAt: r.completed_at,
        })),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: scrub(String((e as Error).message)) });
    }
  });

  // Landing page for links from emails (sign-up confirmation, password reset) opened on a phone.
  app.get('/', (_req, res) => {
    res.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Suno Zara</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#784BA0,#0B0B12 60%);font-family:system-ui,sans-serif;color:#F5F5FA;text-align:center">
<div style="padding:32px"><div style="font-size:56px">🎵</div><h1 style="margin:8px 0">Suno Zara</h1>
<p style="font-size:18px;color:#cfcfe0">✅ All set. You can go back to the app and sign in.</p></div></body></html>`);
  });

  // Public bootstrap info for the apps: they only need the server address, the rest comes from here.
  app.get('/config', (_req, res) =>
    res.json({
      app: 'suno-zara',
      authMode: config.authMode,
      supabaseUrl: config.authMode === 'supabase' ? config.supabaseUrl : null,
      supabaseAnonKey: config.authMode === 'supabase' ? config.supabaseAnonKey : null,
      tosVersion: config.tosVersion,
      unlimited: config.credits.unlimited,
      limits: { maxPromptChars: 500, maxLyricsChars: 5000, maxTags: 12 },
    }),
  );

  // Local-dev file serving (Supabase driver uses signed URLs instead).
  if (config.storageDriver === 'local') {
    app.use('/files', (req, res, next) => {
      const name = typeof req.query.download === 'string' ? req.query.download : null;
      if (name) res.attachment(path.basename(name));
      next();
    }, express.static(localStorageRoot, { maxAge: '1h', fallthrough: false }));
  }

  // Auth first (so the limiter can key by user), then rate limiting.
  app.use(optionalAuth, apiLimiter);
  app.use('/generations', generations);
  app.use('/songs', songs);
  app.use('/ai', ai);
  app.use('/', social);

  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  app.use(errorHandler);
  return app;
}

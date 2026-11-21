import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { ah, notFound, HttpError } from '../lib/errors.js';
import { requireAuth, uid } from '../middleware/auth.js';
import { generationLimiter } from '../middleware/rateLimit.js';
import { assertCanAfford, assertConcurrency } from '../services/credits.js';
import { moderate } from '../services/moderation.js';
import { SONG_SELECT, toSongDTOs, type SongRow } from '../services/songs.js';
import type { GenerationInput } from '../jobs.js';

export const generations = Router();
generations.use(requireAuth);

const tags = z.array(z.string().trim().min(1).max(40)).max(12).default([]);

const CreateBody = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('simple'),
    prompt: z.string().trim().min(3).max(500),
    instrumental: z.boolean().default(false),
    seed: z.number().int().nonnegative().optional(),
  }),
  z.object({
    mode: z.literal('custom'),
    title: z.string().trim().max(100).optional(),
    lyrics: z.string().trim().max(5000).optional(),
    styleTags: tags,
    prompt: z.string().trim().max(500).default(''),
    instrumental: z.boolean().default(false),
    seed: z.number().int().nonnegative().optional(),
  }),
]).refine((b) => b.mode === 'simple' || b.instrumental || !!b.lyrics || b.styleTags.length > 0 || !!b.prompt, {
  message: 'Add lyrics, a style, or a description',
});

const ExtendBody = z.object({
  lyrics: z.string().trim().max(5000).optional(),
  styleTags: tags,
  continueAtSec: z.number().nonnegative().optional(),
});
const RemixBody = z.object({
  styleTags: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
  prompt: z.string().trim().max(500).optional(),
});

async function startGeneration(userId: string, type: 'create' | 'extend' | 'remix', input: GenerationInput) {
  await moderate(userId, {
    prompt: input.prompt, lyrics: input.lyrics, title: input.title, tags: input.styleTags.join(', '),
  });
  await assertConcurrency(userId);
  const cost = config.credits.perGeneration;
  await assertCanAfford(userId, cost);

  // Inserting a 'queued' row is the enqueue — the worker claims it from Postgres.
  return one(
    `insert into generations (user_id, type, input, credits_cost, status_text)
     values ($1, $2, $3, $4, 'Waiting in queue…') returning *`,
    [userId, type, JSON.stringify(input), config.credits.unlimited ? 0 : cost],
  );
}

async function ownSource(userId: string, songId: string) {
  // Extend/remix your own songs, or public songs from others.
  const s = await one<SongRow>(
    `select * from songs where id = $1 and deleted_at is null and (user_id = $2 or is_public)`,
    [songId, userId],
  );
  if (!s) throw notFound('Song');
  return s;
}

/** Position in line, so the app can say "3 songs ahead of you". */
async function queuePosition(g: any): Promise<number | null> {
  if (g.status !== 'queued') return null;
  const r = await one<{ n: string }>(`select count(*) as n from generations where status = 'queued' and created_at < $1`, [g.created_at]);
  return Number(r?.n ?? 0);
}

const genDTO = (g: any, position: number | null = null) => ({
  id: g.id, type: g.type, status: g.status, progress: g.progress, statusText: g.status_text,
  error: g.status === 'failed' ? 'Generation failed — no credits were used.' : null,
  queuePosition: position, creditsCost: g.credits_cost, input: g.input, createdAt: g.created_at, completedAt: g.completed_at,
});

/** POST /generations — simple or custom create. Returns 202; poll GET /generations/:id. */
generations.post('/', generationLimiter, ah(async (req, res) => {
  const b = CreateBody.parse(req.body);
  const input: GenerationInput =
    b.mode === 'simple'
      ? { mode: 'simple', prompt: b.prompt, instrumental: b.instrumental, styleTags: [], seed: b.seed }
      : { mode: 'custom', prompt: b.prompt, title: b.title, lyrics: b.instrumental ? undefined : b.lyrics, styleTags: b.styleTags, instrumental: b.instrumental, seed: b.seed };
  const gen = await startGeneration(uid(req), 'create', input);
  res.status(202).json({ generation: genDTO(gen) });
}));

/** POST /generations/extend/:songId */
generations.post('/extend/:songId', generationLimiter, ah(async (req, res) => {
  const b = ExtendBody.parse(req.body);
  const src = await ownSource(uid(req), req.params.songId);
  if (Number(src.duration_sec) >= config.limits.maxDurationSec) {
    throw new HttpError(400, 'max_length', `Songs can be at most ${config.limits.maxDurationSec / 60} minutes.`);
  }
  const gen = await startGeneration(uid(req), 'extend', {
    mode: 'custom', prompt: src.prompt ?? '', lyrics: b.lyrics, styleTags: b.styleTags,
    instrumental: src.is_instrumental, sourceSongId: src.id, continueAtSec: b.continueAtSec,
  });
  res.status(202).json({ generation: genDTO(gen) });
}));

/** POST /generations/remix/:songId — same song, new style. */
generations.post('/remix/:songId', generationLimiter, ah(async (req, res) => {
  const b = RemixBody.parse(req.body);
  const src = await ownSource(uid(req), req.params.songId);
  const gen = await startGeneration(uid(req), 'remix', {
    mode: 'custom', prompt: b.prompt ?? src.prompt ?? '', styleTags: b.styleTags,
    instrumental: src.is_instrumental, sourceSongId: src.id,
  });
  res.status(202).json({ generation: genDTO(gen) });
}));

/** GET /generations?active=true — the "in progress" strip on Create/Library. */
generations.get('/', ah(async (req, res) => {
  const active = req.query.active === 'true';
  const r = await query(
    `select * from generations where user_id = $1 ${active ? `and status in ('queued','processing')` : ''}
     order by created_at desc limit 20`,
    [uid(req)],
  );
  res.json({ generations: r.rows.map(genDTO) });
}));

/** GET /generations/:id — poll this every ~2s while status is queued/processing. */
generations.get('/:id', ah(async (req, res) => {
  const g = await one('select * from generations where id = $1 and user_id = $2', [req.params.id, uid(req)]);
  if (!g) throw notFound('Generation');
  let songs: unknown[] = [];
  if (g.status === 'succeeded') {
    const r = await query<SongRow>(
      `select ${SONG_SELECT('$2')} where s.generation_id = $1 and s.deleted_at is null order by s.variation_index`,
      [g.id, uid(req)],
    );
    songs = await toSongDTOs(r.rows, uid(req));
  }
  res.json({ generation: genDTO(g, await queuePosition(g)), songs });
}));

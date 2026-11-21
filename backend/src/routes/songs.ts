import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { one, query, tx } from '../db.js';
import { ah, forbidden, notFound } from '../lib/errors.js';
import { optionalAuth, requireAuth, uid } from '../middleware/auth.js';
import { imageProvider } from '../providers/image/index.js';
import { availableCredits } from '../services/credits.js';
import { moderate } from '../services/moderation.js';
import { SONG_SELECT, toSongDTO, toSongDTOs, type SongRow } from '../services/songs.js';
import { storage } from '../services/storage.js';
import { HttpError } from '../lib/errors.js';

export const songs = Router();

async function findSong(id: string, viewer?: string) {
  const s = await one<SongRow>(
    `select ${SONG_SELECT(viewer ? '$2' : null)} where s.id = $1 and s.deleted_at is null`,
    viewer ? [id, viewer] : [id],
  );
  if (!s) throw notFound('Song');
  if (!s.is_public && s.user_id !== viewer) throw notFound('Song');
  return s;
}
async function findOwnSong(id: string, userId: string) {
  const s = await findSong(id, userId);
  if (s.user_id !== userId) throw forbidden();
  return s;
}

/** GET /songs — my library (cursor = created_at of last item). */
songs.get('/', requireAuth, ah(async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 30), 100);
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
  const q = typeof req.query.q === 'string' && req.query.q.trim() ? `%${req.query.q.trim()}%` : null;
  const r = await query<SongRow>(
    `select ${SONG_SELECT('$1')}
      where s.user_id = $1 and s.deleted_at is null
        and ($2::timestamptz is null or s.created_at < $2)
        and ($3::text is null or s.title ilike $3)
      order by s.created_at desc limit $4`,
    [uid(req), cursor, q, limit],
  );
  const items = await toSongDTOs(r.rows, uid(req));
  res.json({ songs: items, nextCursor: r.rows.length === limit ? r.rows.at(-1)!.created_at : null });
}));

/** GET /songs/liked */
songs.get('/liked', requireAuth, ah(async (req, res) => {
  const r = await query<SongRow>(
    `select ${SONG_SELECT('$1')} join likes lk on lk.song_id = s.id and lk.user_id = $1
      where s.deleted_at is null and (s.is_public or s.user_id = $1)
      order by lk.created_at desc limit 100`,
    [uid(req)],
  );
  res.json({ songs: await toSongDTOs(r.rows, uid(req)) });
}));

/** GET /songs/:id */
songs.get('/:id', optionalAuth, ah(async (req, res) => {
  const s = await findSong(req.params.id, req.user?.id);
  res.json({ song: await toSongDTO(s, req.user?.id) });
}));

/** PATCH /songs/:id — rename, publish/unpublish, edit lyrics/tags metadata. */
const PatchBody = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  isPublic: z.boolean().optional(),
});
songs.patch('/:id', requireAuth, ah(async (req, res) => {
  const b = PatchBody.parse(req.body);
  await findOwnSong(req.params.id, uid(req));
  if (b.title) await moderate(uid(req), { title: b.title });
  await query(
    `update songs set title = coalesce($2, title), is_public = coalesce($3, is_public) where id = $1`,
    [req.params.id, b.title ?? null, b.isPublic ?? null],
  );
  res.json({ song: await toSongDTO(await findSong(req.params.id, uid(req)), uid(req)) });
}));

/** DELETE /songs/:id — soft delete, then remove files. */
songs.delete('/:id', requireAuth, ah(async (req, res) => {
  const s = await findOwnSong(req.params.id, uid(req));
  await query('update songs set deleted_at = now(), is_public = false where id = $1', [s.id]);
  await storage.remove([s.audio_path, ...(s.cover_path ? [s.cover_path] : [])]);
  res.status(204).end();
}));

/** GET /songs/:id/download — redirects to a download URL (MP3). */
songs.get('/:id/download', optionalAuth, ah(async (req, res) => {
  const s = await findSong(req.params.id, req.user?.id);
  const ext = s.audio_path.split('.').pop();
  const safe = s.title.replace(/[^\w\- ]+/g, '').trim() || 'song';
  res.redirect(302, await storage.url(s.audio_path, { downloadName: `${safe}.${ext}`, expiresInSec: 300 }));
}));

/** POST /songs/:id/play — count a play (call after ~10s of listening). */
songs.post('/:id/play', optionalAuth, ah(async (req, res) => {
  const s = await findSong(req.params.id, req.user?.id);
  await query('insert into plays (song_id, user_id) values ($1, $2)', [s.id, req.user?.id ?? null]);
  res.status(204).end();
}));

/** POST / DELETE /songs/:id/like */
songs.post('/:id/like', requireAuth, ah(async (req, res) => {
  const s = await findSong(req.params.id, uid(req));
  await query('insert into likes (user_id, song_id) values ($1, $2) on conflict do nothing', [uid(req), s.id]);
  res.json({ liked: true, likeCount: (await one('select like_count from songs where id = $1', [s.id])).like_count });
}));
songs.delete('/:id/like', requireAuth, ah(async (req, res) => {
  await query('delete from likes where user_id = $1 and song_id = $2', [uid(req), req.params.id]);
  const r = await one('select like_count from songs where id = $1', [req.params.id]);
  res.json({ liked: false, likeCount: r?.like_count ?? 0 });
}));

/** POST /songs/:id/cover — regenerate cover art (charged only on success). */
songs.post('/:id/cover', requireAuth, ah(async (req, res) => {
  const s = await findOwnSong(req.params.id, uid(req));
  const cost = config.credits.unlimited ? 0 : config.credits.perCoverArt;
  const available = await availableCredits(uid(req));
  if (available < cost) throw new HttpError(402, 'insufficient_credits', undefined, { required: cost, available });

  const seed = Math.floor(Math.random() * 0x7fffffff);
  const cover = await imageProvider().generateCover({ title: s.title, prompt: s.prompt ?? '', styleTags: s.style_tags, seed });
  const key = `covers/${s.user_id}/${s.id}-${seed}.${cover.ext}`;
  await storage.put(key, cover.image, cover.mimeType);
  try {
    // Swap the cover and charge in one transaction — no charge if anything fails.
    await tx(async (c) => {
      await c.query('update songs set cover_path = $2 where id = $1', [s.id, key]);
      if (cost > 0) await c.query(`select spend_credits($1, $2, 'cover_art')`, [uid(req), cost]);
    });
  } catch (e) {
    await storage.remove([key]);
    throw e;
  }
  if (s.cover_path) await storage.remove([s.cover_path]);
  res.json({ song: await toSongDTO(await findSong(s.id, uid(req)), uid(req)) });
}));

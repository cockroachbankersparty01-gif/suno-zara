import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { ah, HttpError, notFound } from '../lib/errors.js';
import { optionalAuth, requireAuth, uid } from '../middleware/auth.js';
import { ledger, refreshDailyCredits, availableCredits } from '../services/credits.js';
import { moderate } from '../services/moderation.js';
import { SONG_SELECT, toSongDTO, toSongDTOs, type SongRow } from '../services/songs.js';

export const social = Router();

const profileDTO = (p: any, extra: Record<string, unknown> = {}) => ({
  id: p.id, username: p.username, displayName: p.display_name, avatarUrl: p.avatar_url, bio: p.bio,
  followerCount: p.follower_count, followingCount: p.following_count, createdAt: p.created_at, ...extra,
});

// ───────── Me ─────────
social.get('/me', requireAuth, ah(async (req, res) => {
  const credits = await refreshDailyCredits(uid(req));
  const p = await one('select * from profiles where id = $1', [uid(req)]);
  const tos = await one('select 1 from tos_acceptances where user_id = $1 and tos_version = $2', [uid(req), config.tosVersion]);
  res.json({
    profile: profileDTO(p),
    credits: config.credits.unlimited
      ? { unlimited: true }
      : { unlimited: false, balance: credits, available: await availableCredits(uid(req)), dailyFree: config.credits.dailyFree, perGeneration: config.credits.perGeneration },
    tos: { currentVersion: config.tosVersion, accepted: !!tos },
  });
}));

const PatchMe = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/).optional(),
  displayName: z.string().trim().min(1).max(50).optional(),
  bio: z.string().trim().max(280).optional(),
  avatarUrl: z.string().url().max(500).optional(),
});
social.patch('/me', requireAuth, ah(async (req, res) => {
  const b = PatchMe.parse(req.body);
  await moderate(uid(req), { title: [b.username, b.displayName, b.bio].filter(Boolean).join(' ') });
  try {
    const p = await one(
      `update profiles set username = coalesce($2, username), display_name = coalesce($3, display_name),
              bio = coalesce($4, bio), avatar_url = coalesce($5, avatar_url) where id = $1 returning *`,
      [uid(req), b.username ?? null, b.displayName ?? null, b.bio ?? null, b.avatarUrl ?? null],
    );
    res.json({ profile: profileDTO(p) });
  } catch (e: any) {
    if (e?.code === '23505') throw new HttpError(409, 'username_taken');
    throw e;
  }
}));

social.post('/me/tos', requireAuth, ah(async (req, res) => {
  const { version } = z.object({ version: z.string() }).parse(req.body);
  if (version !== config.tosVersion) throw new HttpError(400, 'stale_tos', 'Please review the latest terms.');
  await query('insert into tos_acceptances (user_id, tos_version) values ($1, $2) on conflict do nothing', [uid(req), version]);
  res.status(204).end();
}));

// ───────── Credits (free daily quota — no payments anywhere) ─────────
social.get('/credits/ledger', requireAuth, ah(async (req, res) => res.json({ entries: await ledger(uid(req)) })));

// ───────── Explore ─────────
social.get('/explore', optionalAuth, ah(async (req, res) => {
  const tab = req.query.tab === 'new' ? 'new' : req.query.tab === 'following' ? 'following' : 'trending';
  const limit = Math.min(Number(req.query.limit ?? 30), 60);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  const tag = typeof req.query.tag === 'string' ? req.query.tag.toLowerCase() : null;
  const me = req.user?.id ?? null;
  if (tab === 'following' && !me) throw new HttpError(401, 'unauthenticated');

  const base =
    tab === 'trending'
      ? `select t.*, p.username, p.display_name, p.avatar_url,
                ($1::uuid is not null and exists (select 1 from likes l where l.song_id = t.id and l.user_id = $1)) as liked_by_me
           from trending_songs t join profiles p on p.id = t.user_id
          where ($2::text is null or $2 = any(t.style_tags))
          order by t.trend_score desc`
      : `select ${SONG_SELECT('$1')}
          where s.is_public and s.deleted_at is null
            and ($2::text is null or $2 = any(s.style_tags))
            ${tab === 'following' ? 'and s.user_id in (select followee_id from follows where follower_id = $1)' : ''}
          order by s.created_at desc`;
  const r = await query<SongRow>(`${base} limit $3 offset $4`, [me, tag, limit, offset]);
  res.json({ tab, songs: await toSongDTOs(r.rows, me ?? undefined), nextOffset: r.rows.length === limit ? offset + limit : null });
}));

/** GET /s/:slug — public share link payload (for web share page + deep links). */
social.get('/s/:slug', optionalAuth, ah(async (req, res) => {
  const s = await one<SongRow>(
    `select ${SONG_SELECT(req.user ? '$2' : null)} where s.share_slug = $1 and s.deleted_at is null`,
    req.user ? [req.params.slug, req.user.id] : [req.params.slug],
  );
  if (!s || (!s.is_public && s.user_id !== req.user?.id)) throw notFound('Song');
  res.json({ song: await toSongDTO(s, req.user?.id) });
}));

// ───────── Profiles & follows ─────────
async function profileByUsername(username: string) {
  const p = await one('select * from profiles where username = $1', [username.toLowerCase()]);
  if (!p) throw notFound('User');
  return p;
}

social.get('/users/:username', optionalAuth, ah(async (req, res) => {
  const p = await profileByUsername(req.params.username);
  const following = req.user
    ? !!(await one('select 1 from follows where follower_id = $1 and followee_id = $2', [req.user.id, p.id]))
    : false;
  res.json({ profile: profileDTO(p, { followedByMe: following }) });
}));

social.get('/users/:username/songs', optionalAuth, ah(async (req, res) => {
  const p = await profileByUsername(req.params.username);
  const me = req.user?.id ?? null;
  const r = await query<SongRow>(
    `select ${SONG_SELECT('$2')} where s.user_id = $1 and s.deleted_at is null and s.is_public
      order by s.created_at desc limit 100`,
    [p.id, me],
  );
  res.json({ songs: await toSongDTOs(r.rows, me ?? undefined) });
}));

social.post('/users/:username/follow', requireAuth, ah(async (req, res) => {
  const p = await profileByUsername(req.params.username);
  if (p.id === uid(req)) throw new HttpError(400, 'cannot_follow_self');
  await query('insert into follows (follower_id, followee_id) values ($1, $2) on conflict do nothing', [uid(req), p.id]);
  res.json({ following: true });
}));
social.delete('/users/:username/follow', requireAuth, ah(async (req, res) => {
  const p = await profileByUsername(req.params.username);
  await query('delete from follows where follower_id = $1 and followee_id = $2', [uid(req), p.id]);
  res.json({ following: false });
}));

// Re-export for the share page
export { toSongDTO };

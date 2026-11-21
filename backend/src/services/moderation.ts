import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { query } from '../db.js';
import { HttpError } from '../lib/errors.js';

/**
 * Starter moderation: word/phrase lists + artist-imitation patterns.
 * Lists live in backend/data/*.txt (one entry per line, # for comments) so they can be
 * edited without a deploy. For production, add a moderation API call in `moderate()`.
 */
const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');

function loadList(file: string): string[] {
  const p = path.join(dataDir, file);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#'));
}

const normalize = (s: string) =>
  s.toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[0@]/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[$5]/g, 's').replace(/4/g, 'a')
    .replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (terms: string[]) =>
  terms.length ? new RegExp(`\\b(${terms.map((t) => escapeRe(normalize(t))).join('|')})\\b`, 'i') : null;

let hateRe: RegExp | null;
let artistRe: RegExp | null;
export function reloadLists() {
  hateRe = wordRe(loadList('blocklist.txt'));
  artistRe = wordRe(loadList('artists.txt'));
}
reloadLists();

// "in the style of X", "sounds like X", "X's voice" → block when X is a listed artist.
const IMITATION = /\b(style of|sounds? like|voice of|sung by|feat|featuring|cover of|by)\b/i;

export type ModerationField = 'prompt' | 'lyrics' | 'title' | 'tags';
export interface ModerationHit { field: ModerationField; rule: 'hate' | 'artist'; excerpt: string }

export function check(fields: Partial<Record<ModerationField, string | undefined>>): ModerationHit[] {
  const hits: ModerationHit[] = [];
  for (const [field, raw] of Object.entries(fields) as [ModerationField, string | undefined][]) {
    if (!raw) continue;
    const text = normalize(raw);
    const h = hateRe?.exec(text);
    if (h) hits.push({ field, rule: 'hate', excerpt: h[0] });
    const a = artistRe?.exec(text);
    // Artist names are always blocked in tags/prompt; in lyrics only when used as imitation cues.
    if (a && (field !== 'lyrics' || IMITATION.test(text))) hits.push({ field, rule: 'artist', excerpt: a[0] });
  }
  return hits;
}

/** Throws a 422 the client can show inline; logs the event for review. */
export async function moderate(userId: string, fields: Partial<Record<ModerationField, string | undefined>>) {
  const hits = check(fields);
  if (!hits.length) return;
  await query(
    `insert into moderation_events (user_id, field, rule, excerpt)
     select $1, x->>'field', x->>'rule', x->>'excerpt' from jsonb_array_elements($2::jsonb) x`,
    [userId, JSON.stringify(hits)],
  ).catch((e) => console.error('moderation log failed', e));

  const artist = hits.find((h) => h.rule === 'artist');
  throw new HttpError(
    422,
    'content_blocked',
    artist
      ? "We don't generate music that imitates real artists. Try describing the genre, mood, or instruments instead."
      : 'This content goes against our community guidelines.',
    { fields: [...new Set(hits.map((h) => h.field))], rule: artist ? 'artist' : 'hate' },
  );
}

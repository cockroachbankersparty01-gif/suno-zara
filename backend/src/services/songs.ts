import { storage } from './storage.js';

export interface SongRow {
  id: string; user_id: string; generation_id: string | null; variation_index: number;
  kind: string; parent_song_id: string | null; title: string; prompt: string | null;
  lyrics: string | null; style_tags: string[]; is_instrumental: boolean;
  audio_path: string; cover_path: string | null; duration_sec: string | number;
  waveform: number[] | null; provider: string; model: string; model_version: string | null;
  seed: string | number; params: Record<string, unknown>; is_public: boolean; share_slug: string;
  play_count: number; like_count: number; created_at: string;
  // optional joins
  username?: string; display_name?: string; avatar_url?: string | null; liked_by_me?: boolean;
}

/** Columns + author join used by every song listing. `$me` is the param index of the viewer id. */
export const SONG_SELECT = (me: string | null) => `
  s.*, p.username, p.display_name, p.avatar_url,
  ${me ? `exists (select 1 from likes l where l.song_id = s.id and l.user_id = ${me})` : 'false'} as liked_by_me
  from songs s join profiles p on p.id = s.user_id`;

export async function toSongDTO(s: SongRow, viewerId?: string) {
  const ext = s.audio_path.split('.').pop() ?? 'mp3';
  const downloadName = `${s.title.replace(/[^\w\- ]+/g, '').trim() || 'song'}.${ext}`;
  const [audioUrl, coverUrl, downloadUrl] = await Promise.all([
    storage.url(s.audio_path),
    s.cover_path ? storage.url(s.cover_path) : Promise.resolve(null),
    storage.url(s.audio_path, { downloadName }),
  ]);
  const isOwner = viewerId === s.user_id;
  return {
    id: s.id,
    title: s.title,
    kind: s.kind,
    parentSongId: s.parent_song_id,
    generationId: s.generation_id,
    variationIndex: s.variation_index,
    prompt: s.prompt,
    lyrics: s.lyrics,
    styleTags: s.style_tags,
    isInstrumental: s.is_instrumental,
    audioUrl,
    downloadUrl,
    coverUrl,
    durationSec: Number(s.duration_sec),
    waveform: s.waveform ?? [],
    isPublic: s.is_public,
    shareUrl: `/s/${s.share_slug}`,
    playCount: s.play_count,
    likeCount: s.like_count,
    likedByMe: !!s.liked_by_me,
    createdAt: s.created_at,
    author: s.username ? { id: s.user_id, username: s.username, displayName: s.display_name, avatarUrl: s.avatar_url ?? null } : undefined,
    // Reproducibility details only for the owner.
    ...(isOwner && { generation: { provider: s.provider, model: s.model, modelVersion: s.model_version, seed: Number(s.seed), params: s.params } }),
  };
}

export const toSongDTOs = (rows: SongRow[], viewerId?: string) => Promise.all(rows.map((r) => toSongDTO(r, viewerId)));

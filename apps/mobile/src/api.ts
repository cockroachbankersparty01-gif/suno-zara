// Typed client for the Suno Zara backend (see backend README for the full API).

export interface Author { id: string; username: string; displayName: string | null; avatarUrl: string | null }

export interface Song {
  id: string;
  title: string;
  kind: 'original' | 'extension' | 'remix';
  parentSongId: string | null;
  generationId: string | null;
  variationIndex: number;
  prompt: string | null;
  lyrics: string | null;
  styleTags: string[];
  isInstrumental: boolean;
  audioUrl: string;
  downloadUrl: string;
  coverUrl: string | null;
  durationSec: number;
  waveform: number[];
  isPublic: boolean;
  shareUrl: string;
  playCount: number;
  likeCount: number;
  likedByMe: boolean;
  createdAt: string;
  author?: Author;
  generation?: { provider: string; model: string; modelVersion: string | null; seed: number; params: Record<string, unknown> };
}

export interface Generation {
  id: string;
  type: 'create' | 'extend' | 'remix';
  status: 'queued' | 'processing' | 'succeeded' | 'failed';
  progress: number;
  statusText: string | null;
  queuePosition: number | null;
  error: string | null;
  creditsCost: number;
  input: { prompt?: string; title?: string; styleTags?: string[]; instrumental?: boolean };
  createdAt: string;
  completedAt: string | null;
}

export interface Profile {
  id: string; username: string; displayName: string | null; avatarUrl: string | null; bio: string | null;
  followerCount: number; followingCount: number; createdAt: string; followedByMe?: boolean;
}

export type Credits =
  | { unlimited: true }
  | { unlimited: false; balance: number; available: number; dailyFree: number; perGeneration: number };

export interface Me { profile: Profile; credits: Credits; tos: { currentVersion: string; accepted: boolean } }

export interface ServerConfig {
  app: string;
  authMode: 'dev' | 'supabase';
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  tosVersion: string;
  unlimited: boolean;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any) {
    super(message);
  }
}

/** Human-friendly text for the errors users can actually hit. */
export function friendlyError(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'insufficient_credits':
        return "You've used today's free songs. Your free credits refill tomorrow!";
      case 'content_blocked':
        return e.message;
      case 'too_many_active':
        return 'Two songs are already being made. Wait for one to finish.';
      case 'rate_limited':
        return 'Slow down a little and try again in a minute.';
      case 'invalid_input':
        return 'Please check what you typed and try again.';
      case 'unauthenticated':
      case 'invalid_token':
        return 'Please sign in again.';
      default:
        return e.message || 'Something went wrong.';
    }
  }
  if (e instanceof Error && /Network request failed|fetch/i.test(e.message)) {
    return "Can't reach the server. Check your internet, or the server address in Profile → Settings.";
  }
  return e instanceof Error ? e.message : 'Something went wrong.';
}

export const normalizeServerUrl = (u: string) => u.trim().replace(/\/+$/, '');

/** Checks that a URL really is a Suno Zara server, and returns its config. */
export async function fetchServerConfig(serverUrl: string): Promise<ServerConfig> {
  const res = await fetch(`${normalizeServerUrl(serverUrl)}/config`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Server answered ${res.status}`);
  const cfg = (await res.json()) as ServerConfig;
  if (cfg.app !== 'suno-zara') throw new Error("That address isn't a Suno Zara server.");
  return cfg;
}

export function createApi(serverUrl: string, getToken: () => Promise<string | null>) {
  const base = normalizeServerUrl(serverUrl);

  async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await getToken();
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message ?? `Error ${res.status}`, data.details);
    return data as T;
  }

  const q = (params: Record<string, string | number | undefined | null>) => {
    const s = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    return s ? `?${s}` : '';
  };

  return {
    base,
    me: () => req<Me>('GET', '/me'),
    updateMe: (b: Partial<{ username: string; displayName: string; bio: string }>) => req<{ profile: Profile }>('PATCH', '/me', b),
    acceptTos: (version: string) => req<void>('POST', '/me/tos', { version }),

    createSimple: (prompt: string, instrumental: boolean) =>
      req<{ generation: Generation }>('POST', '/generations', { mode: 'simple', prompt, instrumental }),
    createCustom: (b: { title?: string; lyrics?: string; styleTags: string[]; prompt?: string; instrumental: boolean }) =>
      req<{ generation: Generation }>('POST', '/generations', { mode: 'custom', ...b }),
    extend: (songId: string) => req<{ generation: Generation }>('POST', `/generations/extend/${songId}`, {}),
    remix: (songId: string, styleTags: string[]) => req<{ generation: Generation }>('POST', `/generations/remix/${songId}`, { styleTags }),
    activeGenerations: () => req<{ generations: Generation[] }>('GET', '/generations?active=true'),
    generation: (id: string) => req<{ generation: Generation; songs: Song[] }>('GET', `/generations/${id}`),

    writeLyrics: (prompt: string, styleTags: string[]) => req<{ title: string; lyrics: string }>('POST', '/ai/lyrics', { prompt, styleTags }),

    library: (cursor?: string | null, search?: string) =>
      req<{ songs: Song[]; nextCursor: string | null }>('GET', `/songs${q({ cursor, q: search, limit: 30 })}`),
    liked: () => req<{ songs: Song[] }>('GET', '/songs/liked'),
    song: (id: string) => req<{ song: Song }>('GET', `/songs/${id}`),
    updateSong: (id: string, b: { title?: string; isPublic?: boolean }) => req<{ song: Song }>('PATCH', `/songs/${id}`, b),
    deleteSong: (id: string) => req<void>('DELETE', `/songs/${id}`),
    newCover: (id: string) => req<{ song: Song }>('POST', `/songs/${id}/cover`),
    play: (id: string) => req<void>('POST', `/songs/${id}/play`),
    like: (id: string) => req<{ liked: boolean; likeCount: number }>('POST', `/songs/${id}/like`),
    unlike: (id: string) => req<{ liked: boolean; likeCount: number }>('DELETE', `/songs/${id}/like`),

    explore: (tab: 'trending' | 'new' | 'following', offset = 0) =>
      req<{ songs: Song[]; nextOffset: number | null }>('GET', `/explore${q({ tab, offset, limit: 30 })}`),
    user: (username: string) => req<{ profile: Profile }>('GET', `/users/${encodeURIComponent(username)}`),
    userSongs: (username: string) => req<{ songs: Song[] }>('GET', `/users/${encodeURIComponent(username)}/songs`),
    follow: (username: string) => req<{ following: boolean }>('POST', `/users/${encodeURIComponent(username)}/follow`),
    unfollow: (username: string) => req<{ following: boolean }>('DELETE', `/users/${encodeURIComponent(username)}/follow`),
  };
}

export type Api = ReturnType<typeof createApi>;

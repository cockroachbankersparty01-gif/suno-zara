import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { one, query, tx } from './db.js';
import { hasFfmpeg, toMp3, waveformPeaks } from './lib/audio.js';
import { newSeed } from './lib/random.js';
import { imageProvider } from './providers/image/index.js';
import { lyricsProvider } from './providers/lyrics/index.js';
import { musicProvider, type MusicRequest } from './providers/music/index.js';
import { storage } from './services/storage.js';
import type { SongRow } from './services/songs.js';

/**
 * Generation worker. The job queue is the `generations` table itself:
 * rows are claimed with FOR UPDATE SKIP LOCKED (see claim_generation() in the schema),
 * so there's no Redis to host. Run several workers if you have several GPUs.
 */

export interface GenerationInput {
  mode: 'simple' | 'custom';
  prompt: string;
  lyrics?: string;
  styleTags: string[];
  title?: string;
  instrumental: boolean;
  sourceSongId?: string;
  continueAtSec?: number;
  seed?: number; // optional: reproduce a previous result
}

interface GenerationRow {
  id: string; user_id: string; type: 'create' | 'extend' | 'remix';
  status: string; input: GenerationInput; credits_cost: number;
  attempts: number; max_attempts: number;
}

/** Errors that retrying won't fix. */
class PermanentError extends Error {}

const VARIATIONS = 2;
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 1000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function setProgress(id: string, progress: number, text: string) {
  // Also acts as a heartbeat (locked_at) so crashed workers' jobs get picked up again.
  await query(
    `update generations set progress = $2, status_text = $3, locked_at = now() where id = $1 and status = 'processing'`,
    [id, Math.round(Math.max(0, Math.min(99, progress))), text],
  );
}

export async function runGeneration(gen: GenerationRow) {
  const input = gen.input;
  const source = input.sourceSongId
    ? await one<SongRow>('select * from songs where id = $1 and deleted_at is null', [input.sourceSongId])
    : null;
  if (gen.type !== 'create' && !source) throw new PermanentError('source song no longer exists');

  // ── Fill in what the user didn't provide ──
  let { prompt, lyrics, styleTags, title, instrumental } = input;
  if (gen.type === 'create' && input.mode === 'simple') {
    await setProgress(gen.id, 2, 'Understanding your idea…');
    const enhanced = await lyricsProvider().enhancePrompt(prompt);
    styleTags = styleTags.length ? styleTags : enhanced.styleTags;
    title = title || enhanced.title;
    prompt = enhanced.prompt;
  }
  if (source) {
    lyrics = lyrics ?? source.lyrics ?? undefined;
    styleTags = styleTags.length ? styleTags : source.style_tags;
    instrumental = source.is_instrumental && !lyrics ? true : instrumental;
    title = title || (gen.type === 'extend' ? `${source.title} (Extended)` : `${source.title} (Remix)`);
    prompt = prompt || source.prompt || '';
  }
  if (!instrumental && !lyrics) {
    await setProgress(gen.id, 4, 'Writing lyrics…');
    const l = await lyricsProvider().writeLyrics(prompt, styleTags);
    lyrics = l.lyrics;
    title = title || l.title;
  }
  title = (title || 'Untitled').slice(0, 100);

  const durationSec =
    gen.type === 'extend' && source
      ? Math.min(config.limits.maxDurationSec, Math.round(input.continueAtSec ?? Number(source.duration_sec)) + config.limits.extendBySec)
      : gen.type === 'remix' && source
        ? Number(source.duration_sec)
        : config.limits.defaultDurationSec;

  const req: MusicRequest = {
    mode: gen.type, title, prompt, lyrics: instrumental ? undefined : lyrics, styleTags, instrumental,
    seed: input.seed ?? newSeed(), variations: VARIATIONS, durationSec,
    source: source
      ? {
          audio: await storage.get(source.audio_path),
          mimeType: source.audio_path.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg',
          durationSec: Number(source.duration_sec), seed: Number(source.seed), styleTags: source.style_tags,
          lyrics: source.lyrics ?? undefined, continueAtSec: input.continueAtSec,
        }
      : undefined,
  };

  const results = await musicProvider().generate(req, {
    onProgress: (p, text) => setProgress(gen.id, 6 + p * 0.86, text),
  });
  if (results.length === 0) throw new Error('music provider returned no audio');

  await setProgress(gen.id, 94, 'Designing cover art…');
  const ffmpeg = await hasFfmpeg();
  const uploaded: string[] = [];
  const songs: Array<Record<string, unknown>> = [];
  try {
    for (const [v, result] of results.entries()) {
      const songId = randomUUID();
      let audio = result.audio;
      let mime = result.mimeType;
      const waveform = await waveformPeaks(audio);
      if (mime !== 'audio/mpeg' && ffmpeg) {
        audio = await toMp3(audio);
        mime = 'audio/mpeg';
      }
      const audioPath = `songs/${gen.user_id}/${songId}.${mime === 'audio/mpeg' ? 'mp3' : 'wav'}`;
      await storage.put(audioPath, audio, mime);
      uploaded.push(audioPath);

      let coverPath: string | null = null;
      try {
        const cover = await imageProvider().generateCover({ title, prompt, styleTags, seed: result.seed });
        coverPath = `covers/${gen.user_id}/${songId}.${cover.ext}`;
        await storage.put(coverPath, cover.image, cover.mimeType);
        uploaded.push(coverPath);
      } catch (e) {
        console.warn('cover art failed (continuing without):', (e as Error).message);
      }

      songs.push({
        id: songId, user_id: gen.user_id, generation_id: gen.id, variation_index: v,
        kind: gen.type === 'create' ? 'original' : gen.type === 'extend' ? 'extension' : 'remix',
        parent_song_id: source?.id ?? null, title, prompt, lyrics: instrumental ? null : lyrics ?? null,
        style_tags: styleTags, is_instrumental: instrumental, audio_path: audioPath, cover_path: coverPath,
        duration_sec: result.durationSec, waveform: JSON.stringify(waveform), provider: musicProvider().name,
        model: result.model, model_version: result.modelVersion ?? null, seed: result.seed, params: JSON.stringify(result.params),
      });
    }

    // ── Commit: songs + charge + status, all or nothing ──
    await tx(async (c) => {
      for (const s of songs) {
        const cols = Object.keys(s);
        await c.query(
          `insert into songs (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
          Object.values(s),
        );
      }
      await c.query('select charge_generation($1)', [gen.id]);
      await c.query(
        `update generations set status = 'succeeded', progress = 100, status_text = 'Done', completed_at = now(), locked_at = null where id = $1`,
        [gen.id],
      );
    });
  } catch (e) {
    await storage.remove(uploaded);
    if (e instanceof Error && e.message.includes('insufficient_credits')) throw new PermanentError('insufficient_credits');
    throw e;
  }
}

async function handleFailure(gen: GenerationRow, err: Error) {
  if (err.name === 'ProviderUnavailableError') {
    // Not the song's fault: put it back and wait for the music server, without using up an attempt.
    console.warn(`generation ${gen.id}: ${err.message}; waiting for the music server and retrying`);
    await query(
      `update generations set status = 'queued', attempts = greatest(attempts - 1, 0), status_text = 'Waiting for the music server…',
              locked_at = null, run_after = now() + interval '30 seconds' where id = $1`,
      [gen.id],
    );
    return;
  }
  const final = err instanceof PermanentError || gen.attempts >= gen.max_attempts;
  console.error(`generation ${gen.id} attempt ${gen.attempts}/${gen.max_attempts} failed:`, err.message);
  if (final) {
    // Never charged: charge_generation only runs in the success transaction.
    await query(
      `update generations set status = 'failed', error = $2, status_text = 'Failed — no credits were used',
              completed_at = now(), locked_at = null where id = $1`,
      [gen.id, err.message.slice(0, 500)],
    );
  } else {
    const backoffSec = 5 * 2 ** (gen.attempts - 1); // 5s, 10s, 20s…
    await query(
      `update generations set status = 'queued', status_text = 'Retrying…', error = $2, locked_at = null,
              run_after = now() + make_interval(secs => $3) where id = $1`,
      [gen.id, err.message.slice(0, 500), backoffSec],
    );
  }
}

let running = true;
async function loop() {
  let lastSweep = 0;
  while (running) {
    try {
      if (Date.now() - lastSweep > 60_000) {
        const n = (await one<{ n: number }>('select requeue_stale_generations() as n'))?.n ?? 0;
        if (n) console.warn(`requeued ${n} stale generation(s)`);
        lastSweep = Date.now();
      }
      const gen = await one<GenerationRow>('select * from claim_generation()');
      if (!gen) {
        await sleep(POLL_MS);
        continue;
      }
      try {
        await runGeneration(gen);
        console.log(`generation ${gen.id} done`);
      } catch (e) {
        await handleFailure(gen, e instanceof Error ? e : new Error(String(e)));
      }
    } catch (e) {
      console.error('worker loop error:', e);
      await sleep(5000);
    }
  }
}

/** Starts the job loop(s). Resolves when stopWorker() has been called and the current job finished. */
export async function startWorker() {
  console.log(`🎵 worker up — music=${config.musicProvider} lyrics=${config.lyricsProvider} image=${config.imageProvider}`);
  // One worker per GPU is the norm — music models use all the VRAM they get.
  const concurrency = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 1));
  await Promise.all(Array.from({ length: concurrency }, loop));
}

export function stopWorker() {
  console.log('worker stopping after current job…');
  running = false;
}

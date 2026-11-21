export interface MusicRequest {
  mode: 'create' | 'extend' | 'remix';
  title: string;
  prompt: string;
  lyrics?: string;
  styleTags: string[];
  instrumental: boolean;
  /** Base seed. Variation i uses seed + i, so results are reproducible. */
  seed: number;
  /** How many variations to return (the app uses 2). */
  variations: number;
  durationSec: number;
  /** For extend / remix: the song being built on. */
  source?: {
    audio: Buffer;
    mimeType: string;
    durationSec: number;
    seed: number;
    styleTags: string[];
    lyrics?: string;
    /** Extend: continue from this point (defaults to the end). */
    continueAtSec?: number;
  };
}

export interface MusicResult {
  audio: Buffer;
  mimeType: string; // 'audio/wav', 'audio/mpeg', …
  durationSec: number;
  model: string;
  modelVersion?: string;
  seed: number;
  /** Everything needed to reproduce this output with the same provider. */
  params: Record<string, unknown>;
}

export interface ProgressContext {
  onProgress(percent: number, statusText: string): Promise<void> | void;
}

/** Implement this to plug in any music model. Must return `req.variations` results. */
export interface MusicProvider {
  readonly name: string;
  generate(req: MusicRequest, ctx: ProgressContext): Promise<MusicResult[]>;
}

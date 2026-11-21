import { encodeWav } from '../../lib/audio.js';
import { hashString, rng } from '../../lib/random.js';
import type { MusicProvider, MusicRequest, MusicResult, ProgressContext } from './types.js';

/**
 * Mock provider: synthesizes a real, playable little track (chords, bass, drums,
 * and a "vocal" lead when not instrumental) deterministically from the seed.
 *
 * Because it is deterministic, "extend" just renders the same seed for longer —
 * the first N seconds match the source exactly — and "remix" keeps the melody
 * seed but changes the style-driven tempo/timbre.
 */
const SR = 22050;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STYLE_TEMPO: [RegExp, number][] = [
  [/lo-?fi|chill|ambient|ballad|sad/i, 78],
  [/hip.?hop|trap|r&b|rnb/i, 90],
  [/edm|house|techno|dance|electro/i, 124],
  [/rock|punk|metal/i, 140],
  [/bollywood|bhangra|desi|pop/i, 108],
];
const SCALE = [0, 2, 4, 5, 7, 9, 11];
const PROGRESSIONS = [[0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4], [0, 3, 4, 3]]; // I-V-vi-IV etc. (scale degrees)

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class MockMusicProvider implements MusicProvider {
  readonly name = 'mock';

  async generate(req: MusicRequest, ctx: ProgressContext): Promise<MusicResult[]> {
    const out: MusicResult[] = [];
    for (let v = 0; v < req.variations; v++) {
      out.push(await this.one(req, v, {
        onProgress: (p, t) => ctx.onProgress((v * 100 + p) / req.variations, `${t} (${v + 1}/${req.variations})`),
      }));
    }
    return out;
  }

  private async one(req: MusicRequest, v: number, ctx: ProgressContext): Promise<MusicResult> {
    // In extend mode, the melody/structure seed must be the source's (variations differ only after the extension point).
    const extendFrom = req.mode === 'extend' && req.source ? req.source.continueAtSec ?? req.source.durationSec : null;
    const baseSeed = extendFrom !== null ? req.source!.seed : req.seed + v;
    const tailSeed = req.seed + v;
    const styleText = req.styleTags.join(' ') + ' ' + req.prompt;
    const tempo = STYLE_TEMPO.find(([re]) => re.test(styleText))?.[1] ?? 100;
    const styleHash = hashString(req.styleTags.join(',').toLowerCase());
    const r = rng(baseSeed);

    const root = 48 + Math.floor(r() * 12); // C3..B3
    const prog = PROGRESSIONS[Math.floor(r() * PROGRESSIONS.length)];
    const melody = Array.from({ length: 64 }, () => Math.floor(r() * 8)); // 4 bars × 16 steps
    const rt = rng(tailSeed);
    const tailMelody = Array.from({ length: 64 }, () => Math.floor(rt() * 8)); // used after the extend point
    const leadWave = (styleHash % 3) as 0 | 1 | 2; // timbre changes with style → audible remix

    const stages = ['Writing melody…', 'Arranging instruments…', req.instrumental ? 'Mixing…' : 'Recording vocals…', 'Mastering…'];
    for (let i = 0; i < stages.length; i++) {
      await ctx.onProgress(10 + i * 20, stages[i]);
      await sleep(250);
    }

    const total = Math.round(req.durationSec * SR);
    const out = new Float32Array(total);
    const beat = 60 / tempo;
    const step = beat / 4;
    const bar = beat * 4;

    for (let i = 0; i < total; i++) {
      const t = i / SR;
      const barIdx = Math.floor(t / bar);
      const deg = prog[barIdx % prog.length];
      const chordRoot = root + SCALE[deg % 7];
      let s = 0;

      // Pad: diatonic triad (degrees deg, deg+2, deg+4), soft triangle wave
      for (let k = 0; k <= 4; k += 2) {
        const d = deg + k;
        const f = midiHz(root + 12 + SCALE[d % 7] + 12 * Math.floor(d / 7));
        s += 0.06 * Math.asin(Math.sin(2 * Math.PI * f * t)) * (2 / Math.PI);
      }

      // Bass on every beat
      const tb = t % beat;
      s += 0.22 * Math.sin(2 * Math.PI * midiHz(chordRoot - 12) * t) * Math.exp(-tb * 4);

      // Drums: kick on 1&3, snare on 2&4, hats on 8ths
      const beatInBar = Math.floor((t % bar) / beat);
      if (beatInBar % 2 === 0) s += 0.5 * Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-tb * 30)) * tb) * Math.exp(-tb * 9);
      const noise = Math.sin(i * 12.9898 + baseSeed) * 43758.5453;
      const n = (noise - Math.floor(noise)) * 2 - 1;
      if (beatInBar % 2 === 1) s += 0.18 * n * Math.exp(-tb * 18);
      const th = t % (beat / 2);
      s += 0.04 * n * Math.exp(-th * 60);

      // Lead "vocal" (skipped for instrumentals; enters after an 8-bar intro chunk)
      if (!req.instrumental && t > bar * 2) {
        const stepIdx = Math.floor(t / step) % melody.length;
        const ts = t % (step * 2);
        const mel = extendFrom !== null && t >= extendFrom ? tailMelody : melody;
        const deg2 = (deg + mel[stepIdx]) % 7;
        const f = midiHz(root + 24 + SCALE[deg2]) * (1 + 0.006 * Math.sin(2 * Math.PI * 5.5 * t)); // vibrato
        const ph = (f * t) % 1;
        const wave = leadWave === 0 ? Math.sin(2 * Math.PI * ph) : leadWave === 1 ? 2 * ph - 1 : ph < 0.5 ? 1 : -1;
        const env = Math.min(1, ts * 30) * Math.exp(-ts * 2.5);
        s += (leadWave === 0 ? 0.16 : 0.07) * wave * env;
      }

      out[i] = Math.tanh(s * 1.2) * 0.85;
    }

    // Fade in/out
    const fade = Math.min(SR * 1.5, total / 4);
    for (let i = 0; i < fade; i++) {
      out[i] *= i / fade;
      out[total - 1 - i] *= i / fade;
    }

    await ctx.onProgress(95, 'Finishing up…');
    return {
      audio: encodeWav(out, SR),
      mimeType: 'audio/wav',
      durationSec: req.durationSec,
      model: 'mock-synth',
      modelVersion: '1',
      seed: extendFrom !== null ? tailSeed : baseSeed,
      params: { tempo, root, prog, leadWave, mode: req.mode, sampleRate: SR, structureSeed: baseSeed, extendFrom },
    };
  }
}

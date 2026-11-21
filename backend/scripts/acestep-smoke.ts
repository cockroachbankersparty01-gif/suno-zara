// Calls a running ACE-Step API server through our real provider code.
// Usage: ACESTEP_URL=http://127.0.0.1:8001 npx tsx scripts/acestep-smoke.ts
import { writeFileSync } from 'node:fs';
import { AceStepProvider, detectVocalLanguage } from '../src/providers/music/acestep.js';
import { waveformPeaks } from '../src/lib/audio.js';

const url = process.env.ACESTEP_URL ?? 'http://127.0.0.1:8001';
const lyrics = '[Chorus]\nTappa tappa tip tip, tappa tappa tip,\nGolu chala masti mein, karta hai flip!';
console.log('vocal language detected:', detectVocalLanguage(lyrics, ['kids', 'playful'], ''));

const p = new AceStepProvider(url);
const started = Date.now();
const out = await p.generate(
  {
    mode: 'create', title: 'Smoke', prompt: 'playful kids song, upbeat, female vocals',
    lyrics, styleTags: ['kids', 'playful'], instrumental: false, seed: 1234,
    variations: Number(process.env.SMOKE_VARIATIONS ?? 1), durationSec: Number(process.env.SMOKE_DURATION ?? 10),
  },
  { onProgress: (n, t) => console.log(`  progress ${Math.round(n)}% ${t}`) },
);
console.log(`done in ${Math.round((Date.now() - started) / 1000)}s`);
for (const [i, r] of out.entries()) {
  const peaks = await waveformPeaks(r.audio, 40);
  console.log(`result ${i}: ${r.audio.length} bytes, ${r.mimeType}, ${r.durationSec}s, model=${r.model}, seed=${r.seed}, peaks max=${Math.max(...peaks)}`);
  writeFileSync(`smoke-${i}.${r.mimeType.includes('wav') ? 'wav' : 'mp3'}`, r.audio);
  if (r.audio.length < 10_000) throw new Error('audio too small');
}
console.log('✅ ACE-Step contract OK');

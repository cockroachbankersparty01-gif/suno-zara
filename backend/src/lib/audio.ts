import { spawn } from 'node:child_process';
import { config } from '../config.js';

/** Encode mono float samples (-1..1) as a 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const dataLen = samples.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

function runFfmpeg(args: string[], input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(config.ffmpegPath, ['-hide_banner', '-loglevel', 'error', ...args]);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => err.push(d));
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg ${code}: ${Buffer.concat(err)}`)),
    );
    p.stdin.end(input);
  });
}

let ffmpegOk: boolean | undefined;
export async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegOk !== undefined) return ffmpegOk;
  ffmpegOk = await new Promise<boolean>((res) => {
    const p = spawn(config.ffmpegPath, ['-version']);
    p.on('error', () => res(false));
    p.on('close', (c) => res(c === 0));
  });
  return ffmpegOk;
}

/** Any audio → 192 kbps MP3. */
export const toMp3 = (input: Buffer) =>
  runFfmpeg(['-i', 'pipe:0', '-vn', '-ac', '2', '-ar', '44100', '-b:a', '192k', '-f', 'mp3', 'pipe:1'], input);

/** Any audio → mono 8 kHz s16le PCM (just for waveform peaks). */
const toPcm = (input: Buffer) => runFfmpeg(['-i', 'pipe:0', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'], input);

function pcmFromWav(wav: Buffer): Int16Array | null {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') return null;
  let off = 12;
  while (off + 8 <= wav.length) {
    const id = wav.toString('ascii', off, off + 4);
    const size = wav.readUInt32LE(off + 4);
    if (id === 'data') {
      const bytes = wav.subarray(off + 8, off + 8 + size);
      return new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));
    }
    off += 8 + size + (size % 2);
  }
  return null;
}

/** Downsample to N normalized peaks (0..1) for the player's waveform. */
export async function waveformPeaks(audio: Buffer, n = 120): Promise<number[]> {
  let pcm = pcmFromWav(audio);
  if (!pcm && (await hasFfmpeg())) {
    const raw = await toPcm(audio);
    pcm = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 2));
  }
  if (!pcm || pcm.length === 0) return Array(n).fill(0.3);

  const bucket = Math.max(1, Math.floor(pcm.length / n));
  const peaks: number[] = [];
  for (let i = 0; i < n; i++) {
    let max = 0;
    const end = Math.min(pcm.length, (i + 1) * bucket);
    for (let j = i * bucket; j < end; j++) max = Math.max(max, Math.abs(pcm[j]));
    peaks.push(max / 32768);
  }
  const top = Math.max(...peaks, 1e-6);
  return peaks.map((p) => Math.round((p / top) * 100) / 100);
}

// Run with: npm test   (no database, GPU or network needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockMusicProvider } from './providers/music/mock.js';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AceStepProvider, detectVocalLanguage } from './providers/music/acestep.js';
import { DeApiProvider } from './providers/music/deapi.js';
import { MockLyricsProvider, OpenAICompatibleLyricsProvider } from './providers/lyrics/index.js';
import { MockImageProvider, PollinationsImageProvider } from './providers/image/index.js';
import { encodeWav } from './lib/audio.js';
import { hasFfmpeg, toMp3, waveformPeaks } from './lib/audio.js';
import { check } from './services/moderation.js';

const ctx = { onProgress: () => {} };
const base = { mode: 'create' as const, title: 'Monsoon', prompt: 'lo-fi monsoon evenings in Mumbai', styleTags: ['lo-fi'], instrumental: false, seed: 42, durationSec: 8, variations: 1 };
const gen1 = async (req: typeof base & Record<string, unknown>) => (await new MockMusicProvider().generate(req as any, ctx))[0];

/** Starts a throwaway HTTP server for faking ACE-Step / an LLM. */
async function fakeServer(handler: (path: string, body: string, headers: Record<string, any>) => { status?: number; type?: string; body: string | Buffer }) {
  const srv = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const out = handler(req.url ?? '', Buffer.concat(chunks).toString('latin1'), req.headers);
      res.writeHead(out.status ?? 200, { 'content-type': out.type ?? 'application/json' });
      res.end(out.body);
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, close: () => srv.close() };
}

test('mock music is deterministic per seed and differs across seeds', async () => {
  const a = await gen1(base);
  const b = await gen1(base);
  const c = await gen1({ ...base, seed: 43 });
  assert.equal(a.audio.toString('ascii', 0, 4), 'RIFF');
  assert.ok(a.audio.equals(b.audio));
  assert.ok(!a.audio.equals(c.audio));
  assert.equal(a.params.tempo, 78); // lo-fi tempo
});

test('mock returns the requested number of distinct variations', async () => {
  const out = await new MockMusicProvider().generate({ ...base, variations: 2 }, ctx);
  assert.equal(out.length, 2);
  assert.ok(!out[0].audio.equals(out[1].audio));
  assert.deepEqual(out.map((o) => o.seed), [42, 43]);
});

test('extend reproduces the source opening exactly', async () => {
  const src = await gen1(base);
  const ext = await gen1({
    ...base, mode: 'extend', seed: 999, durationSec: 16,
    source: { audio: src.audio, mimeType: 'audio/wav', durationSec: 8, seed: 42, styleTags: ['lo-fi'] },
  } as any);
  // Compare 4s from the middle of the source (skip fades).
  const from = 44 + 2 * 22050 * 2, to = 44 + 2 * 22050 * 6;
  assert.ok(src.audio.subarray(from, to).equals(ext.audio.subarray(from, to)));
  assert.equal(ext.durationSec, 16);
});

test('waveform peaks are normalized', async () => {
  const r = await gen1(base);
  const peaks = await waveformPeaks(r.audio, 50);
  assert.equal(peaks.length, 50);
  assert.equal(Math.max(...peaks), 1);
  assert.ok(peaks.every((p) => p >= 0 && p <= 1));
});

test('wav → mp3 when ffmpeg is present', async (t) => {
  if (!(await hasFfmpeg())) return t.skip('ffmpeg not installed');
  const r = await gen1(base);
  const mp3 = await toMp3(r.audio);
  assert.ok(mp3.length > 1000 && mp3.length < r.audio.length);
  assert.ok(mp3.toString('ascii', 0, 3) === 'ID3' || mp3[0] === 0xff);
});

test('mock lyrics and covers', async () => {
  const l = await new MockLyricsProvider().writeLyrics('monsoon evenings in Mumbai', []);
  assert.match(l.lyrics, /\[Chorus\]/);
  const e = await new MockLyricsProvider().enhancePrompt('chill lo-fi rain');
  assert.ok(e.styleTags.includes('lo-fi') && e.styleTags.includes('chill'));
  const c = await new MockImageProvider().generateCover({ title: '<Rain & Chai>', prompt: '', styleTags: [], seed: 1 });
  assert.match(c.image.toString(), /&#60;Rain &#38; Chai&#62;/); // escaped
});

test('moderation blocks artist imitation and hate phrases, allows normal prompts', () => {
  assert.equal(check({ prompt: 'upbeat lo-fi song about monsoon evenings in Mumbai' }).length, 0);
  assert.equal(check({ prompt: 'a song in the style of Arijit Singh' })[0]?.rule, 'artist');
  assert.equal(check({ tags: 'pop, T4ylor Sw1ft' })[0]?.rule, 'artist'); // leetspeak
  assert.equal(check({ prompt: 'kill all of them' })[0]?.rule, 'hate');
  assert.equal(check({ lyrics: 'I heard arijit singh on the radio' }).length, 0); // mention ≠ imitation
  assert.equal(check({ lyrics: 'sing it like the voice of arijit singh' })[0]?.rule, 'artist');
});

test('ACE-Step field mapping for create / instrumental / extend / remix', () => {
  const f = AceStepProvider.buildFields({ ...base, variations: 2, lyrics: '[Verse]\nhello' });
  assert.equal(f.task_type, 'text2music');
  assert.equal(f.batch_size, '2');
  assert.equal(f.use_random_seed, 'false');
  assert.equal(f.audio_duration, '10'); // clamped to ACE-Step's 10s minimum
  assert.match(f.prompt, /lo-fi monsoon.*lo-fi/);
  assert.equal(AceStepProvider.buildFields({ ...base, instrumental: true }).lyrics, '[Instrumental]');
  const src = { audio: Buffer.alloc(1), mimeType: 'audio/mpeg', durationSec: 30, seed: 1, styleTags: [] };
  const ext = AceStepProvider.buildFields({ ...base, mode: 'extend', durationSec: 60, source: src });
  assert.deepEqual([ext.task_type, ext.repainting_start, ext.repainting_end], ['repaint', '30', '60']);
  assert.equal(AceStepProvider.buildFields({ ...base, mode: 'remix', source: src }).task_type, 'cover');
});

test('ACE-Step provider: submit, poll, download both variations', async () => {
  const wav = encodeWav(new Float32Array(2205).fill(0.1), 22050);
  let polls = 0;
  let sawSource = false;
  let auth = '';
  const srv = await fakeServer((path, body, headers) => {
    auth = String(headers.authorization ?? '');
    if (path === '/release_task') {
      sawSource = body.includes('name="src_audio"');
      assert.ok(body.includes('name="batch_size"'));
      return { body: JSON.stringify({ code: 200, data: { task_id: 't1', status: 'queued', queue_position: 0 } }) };
    }
    if (path === '/query_result') {
      assert.deepEqual(JSON.parse(body).task_id_list, ['t1']);
      polls++;
      const done = polls >= 2;
      const result = JSON.stringify([
        { file: '/v1/audio?path=%2Ftmp%2Fa.wav', seed_value: '7,8', dit_model: 'acestep-v15-turbo', metas: { duration: 12, bpm: 90 } },
        { file: '/v1/audio?path=%2Ftmp%2Fb.wav', seed_value: '7,8', dit_model: 'acestep-v15-turbo', metas: { duration: 12 } },
      ]);
      return { body: JSON.stringify({ code: 200, data: [{ task_id: 't1', status: done ? 1 : 0, result: done ? result : '' }] }) };
    }
    if (path.startsWith('/v1/audio')) return { type: 'audio/wav', body: wav };
    return { status: 404, body: '{}' };
  });
  process.env.ACESTEP_BATCH = 'true';
  try {
    const p = new AceStepProvider(srv.url, 'secret');
    const progress: number[] = [];
    const out = await p.generate(
      { ...base, mode: 'remix', variations: 2, source: { audio: wav, mimeType: 'audio/wav', durationSec: 8, seed: 1, styleTags: [] } },
      { onProgress: (n) => void progress.push(n) },
    );
    assert.equal(out.length, 2);
    assert.deepEqual(out.map((o) => o.seed), [7, 8]);
    assert.equal(out[0].durationSec, 12);
    assert.equal(out[0].mimeType, 'audio/wav');
    assert.ok(out[0].audio.equals(wav));
    assert.ok(sawSource, 'source audio uploaded for remix');
    assert.equal(auth, 'Bearer secret');
    assert.ok(progress.length >= 2);
  } finally {
    delete process.env.ACESTEP_BATCH;
    srv.close();
  }
});

test('ACE-Step: variations one at a time by default; unreachable server is a "wait", not a failure', async () => {
  const wav = encodeWav(new Float32Array(2205).fill(0.1), 22050);
  const batches: string[] = [];
  const srv = await fakeServer((path, body) => {
    if (path === '/release_task') {
      batches.push(/name="batch_size"\r\n\r\n(\d+)/.exec(body)?.[1] ?? '?');
      return { body: JSON.stringify({ data: { task_id: 't' + batches.length } }) };
    }
    if (path === '/query_result') {
      const result = JSON.stringify([{ file: '/v1/audio?path=x', seed_value: String(100 + batches.length), metas: { duration: 10 } }]);
      return { body: JSON.stringify({ data: [{ task_id: 't', status: 1, result }] }) };
    }
    return { type: 'audio/wav', body: wav };
  });
  try {
    const out = await new AceStepProvider(srv.url).generate({ ...base, variations: 2 }, ctx);
    assert.deepEqual(batches, ['1', '1']);
    assert.deepEqual(out.map((o) => o.seed), [101, 102]);
  } finally {
    srv.close();
  }
  await assert.rejects(
    new AceStepProvider('http://127.0.0.1:9').generate({ ...base }, ctx),
    (e: Error) => e.name === 'ProviderUnavailableError',
  );
});

test('ACE-Step failure surfaces as an error', async () => {
  const srv = await fakeServer((path) =>
    path === '/release_task'
      ? { body: JSON.stringify({ data: { task_id: 'x' } }) }
      : { body: JSON.stringify({ data: [{ task_id: 'x', status: 2, result: 'out of memory' }] }) },
  );
  try {
    await assert.rejects(new AceStepProvider(srv.url).generate({ ...base }, ctx), /out of memory/);
  } finally {
    srv.close();
  }
});

test('LLM lyrics provider (OpenAI-compatible, e.g. Ollama) parses fenced JSON', async () => {
  let sentModel = '';
  const srv = await fakeServer((path, body) => {
    assert.equal(path, '/v1/chat/completions');
    sentModel = JSON.parse(body).model;
    const content = '```json\n{"title":"Baarish","lyrics":"[Chorus]\\nBaarish aayi"}\n```';
    return { body: JSON.stringify({ choices: [{ message: { content } }] }) };
  });
  try {
    const l = await new OpenAICompatibleLyricsProvider(`${srv.url}/v1`, 'ollama', 'llama3.2').writeLyrics('Hindi rain song', []);
    assert.equal(l.title, 'Baarish');
    assert.match(l.lyrics, /\[Chorus\]/);
    assert.equal(sentModel, 'llama3.2');
  } finally {
    srv.close();
  }
});

test('Pollinations cover URL is free-tier friendly and deterministic', () => {
  const u = new URL(PollinationsImageProvider.buildUrl({ title: 'Rain', prompt: 'monsoon', styleTags: ['lo-fi'], seed: 5 }));
  assert.equal(u.hostname, 'image.pollinations.ai');
  assert.equal(u.searchParams.get('seed'), '5');
  assert.equal(u.searchParams.get('token'), null);
  assert.match(decodeURIComponent(u.pathname), /album cover art, lo-fi, monsoon/);
});

test('vocal language detection for Hindi / Hinglish / English', () => {
  const golu = '[Verse 1]\nSubah subah aankh khuli, angdaai li badi,\nMumma boli "uth ja Golu", baj gayi ghadi!\nTakiye pe chadh ke main bana superman';
  assert.equal(detectVocalLanguage(golu), 'hi');
  assert.equal(detectVocalLanguage('तुम ही हो'), 'hi');
  assert.equal(detectVocalLanguage('Walking through the night, feeling something new, every little light', []), 'en');
  assert.equal(detectVocalLanguage('la la la', ['bollywood']), 'hi');
  const f = AceStepProvider.buildFields({ ...base, lyrics: golu, variations: 2 });
  assert.equal(f.vocal_language, 'hi');
  assert.equal(AceStepProvider.buildFields({ ...base, instrumental: true }).vocal_language, 'en');
});

test('deAPI provider: form fields, polling, download, two variations', async () => {
  const mp3 = Buffer.alloc(20_000, 7);
  const submitted: URLSearchParams[] = [];
  let polls = 0;
  let auth = '';
  const srv = await fakeServer((path, body, headers) => {
    if (path === '/api/v1/client/txt2music') {
      auth = String(headers.authorization ?? '');
      submitted.push(new URLSearchParams(body));
      return { body: JSON.stringify({ data: { request_id: 'r' + submitted.length } }) };
    }
    if (path.startsWith('/api/v1/client/request-status/')) {
      polls++;
      const done = polls % 2 === 0;
      return { body: JSON.stringify({ data: done ? { status: 'done', result_url: `${srvUrl}/file.mp3` } : { status: 'processing' } }) };
    }
    if (path === '/file.mp3') return { type: 'audio/mpeg', body: mp3 };
    return { status: 404, body: '{}' };
  });
  const srvUrl = srv.url;
  process.env.DEAPI_BASE_URL = `${srv.url}/api/v1/client`;
  try {
    const { DeApiProvider: P } = await import(`./providers/music/deapi.js?x=${Date.now()}`);
    const golu = '[Chorus]\nTappa tappa tip tip, Golu chala masti mein, karta hai flip! Mumma boli uth ja Golu, baj gayi ghadi';
    const out = await new P('key123').generate({ ...base, lyrics: golu, styleTags: ['kids', 'playful'], variations: 2, durationSec: 180 }, ctx);
    assert.equal(out.length, 2);
    assert.equal(auth, 'Bearer key123');
    assert.equal(submitted.length, 2);
    assert.equal(submitted[0].get('model'), 'AceStep_1_5_Turbo');
    assert.equal(submitted[0].get('duration'), '180');
    assert.equal(submitted[0].get('format'), 'mp3');
    assert.match(submitted[0].get('caption')!, /kids, playful, hindi vocals/);
    assert.notEqual(submitted[0].get('seed'), submitted[1].get('seed'));
    assert.ok(out[0].audio.equals(mp3));
  } finally {
    delete process.env.DEAPI_BASE_URL;
    srv.close();
  }
});

test('deAPI without a key waits instead of failing', async () => {
  await assert.rejects(new DeApiProvider(undefined).generate({ ...base }, ctx), (e: Error) => e.name === 'ProviderUnavailableError');
  const f = DeApiProvider.buildForm({ ...base, instrumental: true }, 'AceStep_1_5_Base');
  assert.equal(f.lyrics, '[Instrumental]');
  assert.equal(f.inference_steps, '40');
});

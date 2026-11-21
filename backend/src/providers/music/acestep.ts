import type { MusicProvider, MusicRequest, MusicResult, ProgressContext } from './types.js';

/**
 * ACE-Step 1.5 — open-source (MIT), commercial use allowed, runs on your own machine.
 * Start its API server with `uv run acestep-api` (default http://localhost:8001).
 *
 * API used (docs/en/API.md in the ACE-Step-1.5 repo):
 *   POST /release_task   → { data: { task_id } }
 *   POST /query_result   { task_id_list: [id] } → { data: [{ status: 0|1|2, result: "<json list>" }] }
 *   GET  /v1/audio?path= → audio bytes
 *
 * Mapping:
 *   create → task_type "text2music"
 *   extend → task_type "repaint" over the new tail, with the source as src_audio
 *   remix  → task_type "cover" (same song, new style) with the source as src_audio
 */
interface ReleaseResponse { data?: { task_id: string }; detail?: unknown; error?: unknown }
interface QueryItem { task_id: string; status: 0 | 1 | 2; result?: string }
interface ResultItem { file: string; seed_value?: string; dit_model?: string; lm_model?: string; metas?: { duration?: number; bpm?: number; keyscale?: string } }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class AceStepProvider implements MusicProvider {
  readonly name = 'acestep';
  constructor(private baseUrl: string, private apiKey?: string) {}

  private auth(): Record<string, string> {
    return this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {};
  }

  /** Field values for /release_task. Exported shape is tested in core.test.ts. */
  static buildFields(req: MusicRequest): Record<string, string> {
    const caption = [req.prompt, ...req.styleTags].filter(Boolean).join(', ');
    const f: Record<string, string> = {
      prompt: caption || 'pop song',
      // ACE-Step convention: an "[Instrumental]" lyric produces music without vocals.
      lyrics: req.instrumental ? '[Instrumental]' : (req.lyrics ?? ''),
      audio_duration: String(Math.max(10, Math.min(600, Math.round(req.durationSec)))),
      batch_size: String(Math.max(1, Math.min(8, req.variations))),
      seed: String(req.seed),
      use_random_seed: 'false',
      audio_format: 'mp3',
      task_type: 'text2music',
    };
    if (req.mode === 'extend' && req.source) {
      f.task_type = 'repaint';
      f.repainting_start = String(req.source.continueAtSec ?? req.source.durationSec);
      f.repainting_end = String(req.durationSec);
    }
    if (req.mode === 'remix' && req.source) {
      f.task_type = 'cover';
      f.audio_cover_strength = '0.6'; // lower = follows the new style more, higher = closer to the original
    }
    return f;
  }

  async generate(req: MusicRequest, ctx: ProgressContext): Promise<MusicResult[]> {
    const form = new FormData();
    for (const [k, v] of Object.entries(AceStepProvider.buildFields(req))) form.append(k, v);
    if (req.source) {
      const ext = req.source.mimeType.includes('wav') ? 'wav' : 'mp3';
      form.append('src_audio', new Blob([new Uint8Array(req.source.audio)], { type: req.source.mimeType }), `source.${ext}`);
    }

    await ctx.onProgress(5, 'Warming up the band…');
    const rel = await fetch(`${this.baseUrl}/release_task`, { method: 'POST', headers: this.auth(), body: form });
    if (!rel.ok) throw new Error(`acestep release_task ${rel.status}: ${await rel.text()}`);
    const taskId = ((await rel.json()) as ReleaseResponse).data?.task_id;
    if (!taskId) throw new Error('acestep: no task_id in response');

    const started = Date.now();
    const deadline = started + 15 * 60_000;
    while (Date.now() < deadline) {
      await sleep(2000);
      const q = await fetch(`${this.baseUrl}/query_result`, {
        method: 'POST',
        headers: { ...this.auth(), 'content-type': 'application/json' },
        body: JSON.stringify({ task_id_list: [taskId] }),
      });
      if (!q.ok) throw new Error(`acestep query_result ${q.status}`);
      const item = ((await q.json()) as { data?: QueryItem[] }).data?.[0];
      if (!item) continue;
      if (item.status === 2) throw new Error(`acestep task failed: ${item.result ?? 'unknown error'}`);
      if (item.status === 1) {
        const results = JSON.parse(item.result ?? '[]') as ResultItem[];
        if (!results.length) throw new Error('acestep returned no audio');
        await ctx.onProgress(92, 'Mastering…');
        return Promise.all(results.slice(0, req.variations).map((r, i) => this.download(r, req, i, taskId)));
      }
      // ACE-Step doesn't report % — estimate from elapsed time (typical run < 60s).
      const elapsed = (Date.now() - started) / 1000;
      const pct = Math.min(88, 8 + elapsed * 1.4);
      await ctx.onProgress(pct, elapsed < 15 ? 'Composing…' : elapsed < 35 ? (req.instrumental ? 'Arranging instruments…' : 'Recording vocals…') : 'Mixing…');
    }
    throw new Error('acestep timed out');
  }

  private async download(r: ResultItem, req: MusicRequest, i: number, taskId: string): Promise<MusicResult> {
    const url = r.file.startsWith('http') ? r.file : `${this.baseUrl}${r.file}`;
    const res = await fetch(url, { headers: this.auth() });
    if (!res.ok) throw new Error(`acestep download ${res.status}`);
    const seeds = (r.seed_value ?? '').split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n));
    return {
      audio: Buffer.from(await res.arrayBuffer()),
      mimeType: res.headers.get('content-type')?.startsWith('audio/') ? res.headers.get('content-type')! : 'audio/mpeg',
      durationSec: r.metas?.duration ?? req.durationSec,
      model: r.dit_model ?? 'acestep-v15',
      modelVersion: r.lm_model,
      seed: seeds[i] ?? seeds[0] ?? req.seed + i,
      params: { ...AceStepProvider.buildFields(req), task_id: taskId, bpm: r.metas?.bpm, key: r.metas?.keyscale },
    };
  }
}

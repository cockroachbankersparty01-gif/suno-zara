import { ProviderUnavailableError, detectVocalLanguage } from './acestep.js';
import type { MusicProvider, MusicRequest, MusicResult, ProgressContext } from './types.js';

/**
 * deAPI — hosted ACE-Step 1.5 on their GPUs, pay per track (sign-up includes free credits).
 *   POST {BASE}/txt2music                     (form data)  → { data: { request_id } }
 *   GET  {BASE}/request-status/{request_id}                → { data: { status, result_url?, error? } }
 * Auth: Authorization: Bearer <DEAPI_API_KEY>
 *
 * Text-to-music only: "extend" renders a longer take of the same song, "remix" a new take in the new style.
 */
const BASE = process.env.DEAPI_BASE_URL ?? 'https://api.deapi.ai/api/v1/client';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LANGUAGE_WORDS: Record<string, string> = { hi: 'hindi vocals', pa: 'punjabi vocals' };

export class DeApiProvider implements MusicProvider {
  readonly name = 'deapi';
  constructor(private apiKey: string | undefined, private model = process.env.DEAPI_MODEL ?? 'AceStep_1_5_Turbo') {}

  static buildForm(req: MusicRequest, model: string): Record<string, string> {
    const lang = req.instrumental ? 'en' : detectVocalLanguage(req.lyrics, req.styleTags, req.prompt);
    const caption = [
      ...req.styleTags,
      ...(LANGUAGE_WORDS[lang] && !req.styleTags.some((t) => /hindi|punjabi/i.test(t)) ? [LANGUAGE_WORDS[lang]] : []),
      req.prompt,
    ].map((s) => s?.trim()).filter(Boolean).join(', ').slice(0, 1000);
    const base = /Base/i.test(model);
    return {
      model,
      caption: caption || 'pop song, catchy melody',
      lyrics: req.instrumental ? '[Instrumental]' : (req.lyrics ?? ''),
      duration: String(Math.max(10, Math.min(300, Math.round(req.durationSec)))),
      inference_steps: base ? '40' : '8',
      guidance_scale: base ? '5' : '1',
      seed: String(req.seed),
      format: 'mp3',
    };
  }

  private headers() {
    if (!this.apiKey) throw new ProviderUnavailableError('DEAPI_API_KEY is not set on the server (Render → Environment)');
    return { authorization: `Bearer ${this.apiKey}`, accept: 'application/json' };
  }

  async generate(req: MusicRequest, ctx: ProgressContext): Promise<MusicResult[]> {
    const out: MusicResult[] = [];
    for (let v = 0; v < req.variations; v++) {
      out.push(await this.one({ ...req, seed: req.seed + v }, {
        onProgress: (p, t) => ctx.onProgress((v * 100 + p) / req.variations, `${t} (${v + 1}/${req.variations})`),
      }));
    }
    return out;
  }

  private async one(req: MusicRequest, ctx: ProgressContext): Promise<MusicResult> {
    const form = DeApiProvider.buildForm(req, this.model);
    let submit: Response;
    try {
      submit = await fetch(`${BASE}/txt2music`, {
        method: 'POST',
        headers: this.headers(),
        body: new URLSearchParams(form),
      });
    } catch (e) {
      if (e instanceof ProviderUnavailableError) throw e;
      throw new ProviderUnavailableError(`deAPI not reachable: ${(e as Error).message}`);
    }
    const sj = (await submit.json().catch(() => ({}))) as { data?: { request_id?: string }; message?: string; error?: string };
    if (submit.status === 401 || submit.status === 403) throw new Error('deAPI rejected the API key (check DEAPI_API_KEY)');
    if (submit.status === 402) throw new Error('deAPI credits are used up');
    if (submit.status === 429 || submit.status >= 500) throw new ProviderUnavailableError(`deAPI busy (${submit.status})`);
    const id = sj.data?.request_id;
    if (!submit.ok || !id) throw new Error(`deAPI submit failed (${submit.status}): ${sj.message ?? sj.error ?? 'no request id'}`);

    await ctx.onProgress(5, 'Composing…');
    const started = Date.now();
    while (Date.now() - started < 15 * 60_000) {
      await sleep(3000);
      let st: { data?: { status?: string; result_url?: string; error?: string; progress?: number } };
      try {
        st = (await (await fetch(`${BASE}/request-status/${id}`, { headers: this.headers() })).json()) as typeof st;
      } catch {
        continue; // transient — keep polling
      }
      const status = st.data?.status ?? '';
      if (status === 'done' && st.data?.result_url) {
        await ctx.onProgress(92, 'Downloading…');
        const res = await fetch(st.data.result_url);
        if (!res.ok) throw new Error(`deAPI audio download failed (${res.status})`);
        return {
          audio: Buffer.from(await res.arrayBuffer()),
          mimeType: 'audio/mpeg',
          durationSec: Number(form.duration),
          model: this.model,
          modelVersion: 'deapi',
          seed: req.seed,
          params: { ...form, lyrics: undefined, request_id: id },
        };
      }
      if (status === 'error' || status === 'failed') throw new Error(`deAPI generation failed: ${st.data?.error ?? 'unknown error'}`);
      const elapsed = (Date.now() - started) / 1000;
      const pct = typeof st.data?.progress === 'number' ? Math.min(90, st.data.progress) : Math.min(88, 8 + elapsed * 2);
      await ctx.onProgress(pct, elapsed < 10 ? 'Composing…' : req.instrumental ? 'Arranging instruments…' : 'Recording vocals…');
    }
    throw new Error('deAPI took too long');
  }
}

import { config } from '../../config.js';
import { hashString, rng } from '../../lib/random.js';

export interface LyricsResult { title: string; lyrics: string }
export interface EnhancedPrompt { prompt: string; styleTags: string[]; title: string }

/** Lyric writing + prompt enhancement. */
export interface LyricsProvider {
  readonly name: string;
  writeLyrics(prompt: string, styleTags: string[]): Promise<LyricsResult>;
  enhancePrompt(prompt: string): Promise<EnhancedPrompt>;
}

const GENRES = ['lo-fi', 'pop', 'hip-hop', 'edm', 'rock', 'ballad', 'bollywood', 'r&b', 'jazz', 'acoustic', 'ambient', 'indie'];
const MOODS = ['upbeat', 'chill', 'dreamy', 'sad', 'energetic', 'romantic', 'nostalgic', 'dark'];
const STOP = new Set('a an the of about with and for in on at to song track music make me my some that this is'.split(' '));

function keywords(prompt: string): string[] {
  return prompt.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !GENRES.includes(w) && !MOODS.includes(w));
}
const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Template-based stand-in so the whole flow works without an LLM key. */
export class MockLyricsProvider implements LyricsProvider {
  readonly name = 'mock';

  async writeLyrics(prompt: string, _styleTags: string[]): Promise<LyricsResult> {
    const r = rng(hashString(prompt));
    const kw = keywords(prompt);
    const pick = () => kw.length ? kw[Math.floor(r() * kw.length)] : ['night', 'city', 'heart', 'rain'][Math.floor(r() * 4)];
    const a = pick(), b = pick(), c = pick();
    const title = cap(kw.slice(0, 3).join(' ') || 'Untitled Dream');
    const lyrics = [
      '[Verse 1]',
      `Walking through the ${a}, feeling something new`,
      `Every little ${b} keeps on pulling me to you`,
      `Lights are getting softer, the sky is turning blue`,
      `And all I want tonight is a ${c} with you`,
      '',
      '[Chorus]',
      `Oh, ${a}, don't let it fade away`,
      `Hold on to the ${b}, let it stay`,
      `We're singing it louder, we're finding our way`,
      `Oh, ${a}, don't let it fade away`,
      '',
      '[Verse 2]',
      `Echoes of the ${c} are dancing in my head`,
      `Every word you whispered, every word you said`,
      `Time is moving slower, painted gold and red`,
      `I'm holding every moment like a golden thread`,
      '',
      '[Chorus]',
      `Oh, ${a}, don't let it fade away`,
      `Hold on to the ${b}, let it stay`,
      '',
      '[Outro]',
      `${cap(a)}… let it stay`,
    ].join('\n');
    return { title, lyrics };
  }

  async enhancePrompt(prompt: string): Promise<EnhancedPrompt> {
    const p = prompt.toLowerCase();
    const tags = [...GENRES, ...MOODS].filter((g) => p.includes(g));
    if (!tags.some((t) => GENRES.includes(t))) tags.push('pop');
    if (!tags.some((t) => MOODS.includes(t))) tags.push('upbeat');
    tags.push('catchy melody', 'polished mix');
    const { title } = await this.writeLyrics(prompt, tags);
    return { prompt: `${prompt.trim()}, ${tags.join(', ')}`, styleTags: [...new Set(tags)], title };
  }
}

/**
 * Any OpenAI-compatible chat endpoint. Free options:
 *  - Ollama on your own machine (default): LLM_BASE_URL=http://localhost:11434/v1, LLM_MODEL=llama3.2
 *  - A free hosted tier such as Groq: LLM_BASE_URL=https://api.groq.com/openai/v1 + a free API key
 */
export class OpenAICompatibleLyricsProvider implements LyricsProvider {
  readonly name = 'openai-compatible';
  constructor(private baseUrl: string, private apiKey: string, private model: string) {}

  private async chat(system: string, user: string): Promise<string> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.9,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return body.choices?.[0]?.message?.content ?? '';
  }

  /** Models sometimes wrap JSON in prose or code fences — pull out the first object. */
  static parseJson<T>(text: string): T {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('LLM did not return JSON');
    return JSON.parse(text.slice(start, end + 1)) as T;
  }

  async writeLyrics(prompt: string, styleTags: string[]): Promise<LyricsResult> {
    const raw = await this.chat(
      'You are a songwriter. Write ORIGINAL lyrics only — never copy or paraphrase existing songs, and never imitate a real artist. ' +
        'Use section tags on their own lines: [Verse 1], [Chorus], [Verse 2], [Chorus], [Bridge], [Chorus]. Keep it under 300 words. ' +
        'If the idea mentions a language (e.g. Hindi, Hinglish, Tamil), write in that language. ' +
        'Reply as JSON: {"title": string, "lyrics": string}',
      `Song idea: ${prompt}\nStyle: ${styleTags.join(', ') || 'any'}`,
    );
    const j = OpenAICompatibleLyricsProvider.parseJson<{ title?: string; lyrics?: string }>(raw);
    if (!j.lyrics) throw new Error('LLM returned no lyrics');
    return { title: (j.title || 'Untitled').slice(0, 100), lyrics: j.lyrics.slice(0, 5000) };
  }

  async enhancePrompt(prompt: string): Promise<EnhancedPrompt> {
    const raw = await this.chat(
      'You turn short song ideas into music-generation captions. Describe genre, mood, tempo, instruments and vocal type. ' +
        'Never name real artists. Reply as JSON: {"prompt": string (max 60 words), "styleTags": string[] (3-6 short tags), "title": string}',
      prompt,
    );
    const j = OpenAICompatibleLyricsProvider.parseJson<{ prompt?: string; styleTags?: string[]; title?: string }>(raw);
    return {
      prompt: (j.prompt || prompt).slice(0, 500),
      styleTags: (j.styleTags ?? []).map((t) => String(t).toLowerCase().slice(0, 40)).slice(0, 8),
      title: (j.title || 'Untitled').slice(0, 100),
    };
  }
}

/** Falls back to the mock if the LLM is down, so song creation never breaks because of lyrics. */
class WithFallback implements LyricsProvider {
  readonly name: string;
  constructor(private primary: LyricsProvider, private fallback: LyricsProvider) { this.name = primary.name; }
  async writeLyrics(p: string, t: string[]) {
    try { return await this.primary.writeLyrics(p, t); } catch (e) { console.warn('lyrics LLM failed, using fallback:', (e as Error).message); return this.fallback.writeLyrics(p, t); }
  }
  async enhancePrompt(p: string) {
    try { return await this.primary.enhancePrompt(p); } catch (e) { console.warn('enhance LLM failed, using fallback:', (e as Error).message); return this.fallback.enhancePrompt(p); }
  }
}

let instance: LyricsProvider | undefined;
export function lyricsProvider(): LyricsProvider {
  if (instance) return instance;
  if (config.lyricsProvider === 'mock') return (instance = new MockLyricsProvider());
  if (config.lyricsProvider === 'openai') {
    return (instance = new WithFallback(
      new OpenAICompatibleLyricsProvider(config.llm.baseUrl, config.llm.apiKey, config.llm.model),
      new MockLyricsProvider(),
    ));
  }
  throw new Error(`Unknown LYRICS_PROVIDER "${config.lyricsProvider}" (use mock or openai)`);
}

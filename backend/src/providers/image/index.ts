import { config } from '../../config.js';
import { rng } from '../../lib/random.js';

export interface CoverRequest { title: string; prompt: string; styleTags: string[]; seed: number }
export interface CoverResult { image: Buffer; mimeType: string; ext: string; model: string }

/** Cover art generation. */
export interface ImageProvider {
  readonly name: string;
  generateCover(req: CoverRequest): Promise<CoverResult>;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Seeded gradient-blob SVG cover — good enough to build the UI against. */
export class MockImageProvider implements ImageProvider {
  readonly name = 'mock';
  async generateCover(req: CoverRequest): Promise<CoverResult> {
    const r = rng(req.seed ^ 0x5eed);
    const hue = Math.floor(r() * 360);
    const c1 = `hsl(${hue} 85% 55%)`;
    const c2 = `hsl(${(hue + 60 + r() * 80) % 360} 80% 45%)`;
    const c3 = `hsl(${(hue + 200) % 360} 70% 20%)`;
    const blobs = Array.from({ length: 5 }, () =>
      `<circle cx="${(r() * 512) | 0}" cy="${(r() * 512) | 0}" r="${(80 + r() * 160) | 0}" fill="${r() > 0.5 ? c1 : c2}" opacity="${(0.35 + r() * 0.4).toFixed(2)}"/>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c3}"/><stop offset="1" stop-color="#0b0b12"/></linearGradient>
<filter id="b"><feGaussianBlur stdDeviation="40"/></filter></defs>
<rect width="512" height="512" fill="url(#g)"/><g filter="url(#b)">${blobs}</g>
<text x="32" y="470" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#fff" opacity="0.92">${esc(req.title.slice(0, 26))}</text>
</svg>`;
    return { image: Buffer.from(svg), mimeType: 'image/svg+xml', ext: 'svg', model: 'mock-cover' };
  }
}

/**
 * Pollinations.ai — free image generation, no API key needed.
 * Anonymous use is rate-limited (roughly 1 request / 15s) and may add a watermark;
 * a free account token (POLLINATIONS_TOKEN) lifts both.
 */
export class PollinationsImageProvider implements ImageProvider {
  readonly name = 'pollinations';
  constructor(private token?: string) {}

  static buildUrl(req: CoverRequest, token?: string): string {
    const prompt =
      `album cover art, ${req.styleTags.slice(0, 4).join(', ')}, ${req.prompt || req.title}, ` +
      'vibrant, cinematic lighting, abstract, no text, no letters, no people\'s faces';
    const u = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 400))}`);
    u.searchParams.set('width', '768');
    u.searchParams.set('height', '768');
    u.searchParams.set('seed', String(req.seed % 2147483647));
    u.searchParams.set('nologo', 'true');
    u.searchParams.set('safe', 'true');
    if (token) u.searchParams.set('token', token);
    return u.toString();
  }

  async generateCover(req: CoverRequest): Promise<CoverResult> {
    const res = await fetch(PollinationsImageProvider.buildUrl(req, this.token), { signal: AbortSignal.timeout(90_000) });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) throw new Error(`pollinations ${res.status}`);
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
    return { image: Buffer.from(await res.arrayBuffer()), mimeType: type, ext, model: 'pollinations' };
  }
}

/** If the free service is busy or down, use the generated gradient cover instead. */
class WithFallback implements ImageProvider {
  readonly name: string;
  constructor(private primary: ImageProvider, private fallback: ImageProvider) { this.name = primary.name; }
  async generateCover(req: CoverRequest) {
    try { return await this.primary.generateCover(req); }
    catch (e) { console.warn('cover provider failed, using fallback:', (e as Error).message); return this.fallback.generateCover(req); }
  }
}

let instance: ImageProvider | undefined;
export function imageProvider(): ImageProvider {
  if (instance) return instance;
  if (config.imageProvider === 'mock') return (instance = new MockImageProvider());
  if (config.imageProvider === 'pollinations') {
    return (instance = new WithFallback(new PollinationsImageProvider(config.pollinationsToken || undefined), new MockImageProvider()));
  }
  throw new Error(`Unknown IMAGE_PROVIDER "${config.imageProvider}" (use mock or pollinations)`);
}

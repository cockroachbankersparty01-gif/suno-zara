// End-to-end smoke test against a running server (dev auth, mock providers).
// Usage: BASE=http://localhost:4000 node scripts/e2e.mjs
const BASE = process.env.BASE ?? 'http://localhost:4000';
const TOKEN = `dev:${crypto.randomUUID()}`;
let step = 0;

async function call(method, path, body, token = TOKEN) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : undefined; } catch { json = text; }
  return { status: res.status, json };
}
function check(cond, msg, extra) {
  step++;
  if (!cond) {
    console.error(`❌ ${step}. ${msg}`, extra !== undefined ? JSON.stringify(extra, null, 2) : '');
    process.exit(1);
  }
  console.log(`✅ ${step}. ${msg}`);
}
async function waitFor(genId) {
  const deadline = Date.now() + 180_000;
  let last;
  while (Date.now() < deadline) {
    last = await call('GET', `/generations/${genId}`);
    const s = last.json?.generation?.status;
    if (s === 'succeeded' || s === 'failed') return last.json;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`generation ${genId} did not finish: ${JSON.stringify(last?.json)}`);
}

const cfg = await call('GET', '/config', undefined, null);
check(cfg.status === 200 && cfg.json.app === 'suno-zara', 'GET /config identifies the server', cfg);

const unauth = await call('GET', '/me', undefined, null);
check(unauth.status === 401, '/me without a token is rejected', unauth);

let me = await call('GET', '/me');
check(me.status === 200 && me.json.credits.balance === 50, 'new user gets 50 free credits', me.json);
check(me.json.tos.accepted === false, 'terms not yet accepted');
check((await call('POST', '/me/tos', { version: cfg.json.tosVersion })).status === 204, 'accept terms');

const blocked = await call('POST', '/generations', { mode: 'simple', prompt: 'a song in the style of Arijit Singh' });
check(blocked.status === 422 && blocked.json.error === 'content_blocked', 'artist imitation is blocked', blocked);

const lyr = await call('POST', '/ai/lyrics', { prompt: 'monsoon evenings in Mumbai' });
check(lyr.status === 200 && /\[Chorus\]/.test(lyr.json.lyrics), 'AI lyrics endpoint works', lyr);

const created = await call('POST', '/generations', { mode: 'simple', prompt: 'upbeat lo-fi song about monsoon evenings in Mumbai' });
check(created.status === 202 && created.json.generation.status === 'queued', 'simple create is queued', created);
const done = await waitFor(created.json.generation.id);
check(done.generation.status === 'succeeded', 'generation succeeds', done.generation);
check(done.songs.length === 2, 'two variations returned', done.songs.length);
const [a, b] = done.songs;
check(a.seed !== b.seed || a.generation.seed !== b.generation.seed, 'variations use different seeds');
check(a.waveform.length > 50 && a.lyrics && a.styleTags.length > 0, 'song has waveform, lyrics and tags', a);

const audio = await fetch(a.audioUrl);
const bytes = (await audio.arrayBuffer()).byteLength;
check(audio.ok && bytes > 10_000, `audio file downloads (${bytes} bytes, ${audio.headers.get('content-type')})`);
const cover = await fetch(a.coverUrl);
check(cover.ok, 'cover art downloads');

me = await call('GET', '/me');
check(me.json.credits.balance === 40, 'exactly 10 credits charged after success', me.json.credits);

const custom = await call('POST', '/generations', { mode: 'custom', title: 'Chai Break', lyrics: '[Verse]\nchai and rain\n[Chorus]\nla la', styleTags: ['acoustic'], instrumental: false });
check(custom.status === 202, 'custom create is queued', custom);
const doneCustom = await waitFor(custom.json.generation.id);
check(doneCustom.songs[0]?.title === 'Chai Break' && doneCustom.songs[0].lyrics.includes('chai and rain'), 'custom title and lyrics kept', doneCustom.songs[0]);

const lib = await call('GET', '/songs');
check(lib.status === 200 && lib.json.songs.length === 4, 'library lists 4 songs', lib.json.songs?.length);

const pub = await call('PATCH', `/songs/${a.id}`, { isPublic: true, title: 'Monsoon Nights' });
check(pub.json.song.isPublic && pub.json.song.title === 'Monsoon Nights', 'rename + publish', pub.json);

const other = `dev:${crypto.randomUUID()}`;
const explore = await call('GET', '/explore?tab=new', undefined, other);
check(explore.json.songs.some((s) => s.id === a.id), 'published song appears in Explore for another user', explore.json);
const like = await call('POST', `/songs/${a.id}/like`, undefined, other);
check(like.json.liked && like.json.likeCount === 1, 'another user can like it', like.json);
check((await call('POST', `/songs/${a.id}/play`, undefined, other)).status === 204, 'play is counted');
const trending = await call('GET', '/explore?tab=trending', undefined, other);
check(trending.json.songs[0]?.id === a.id, 'liked song tops Trending', trending.json.songs.map((s) => s.title));
const privateSong = await call('GET', `/songs/${b.id}`, undefined, other);
check(privateSong.status === 404, "another user can't see a private song");

const username = (await call('GET', '/me')).json.profile.username;
const fol = await call('POST', `/users/${username}/follow`, undefined, other);
check(fol.json.following === true, 'follow creator');
const following = await call('GET', '/explore?tab=following', undefined, other);
check(following.json.songs.some((s) => s.id === a.id), 'Following feed shows their song');

const ext = await call('POST', `/generations/extend/${a.id}`, {});
check(ext.status === 202, 'extend is queued', ext);
const doneExt = await waitFor(ext.json.generation.id);
check(doneExt.generation.status === 'succeeded' && doneExt.songs[0].durationSec > a.durationSec, `extended song is longer (${a.durationSec}s → ${doneExt.songs[0]?.durationSec}s)`, doneExt);
check(doneExt.songs[0].kind === 'extension' && doneExt.songs[0].parentSongId === a.id, 'extension linked to original');

me = await call('GET', '/me');
check(me.json.credits.balance === 20, '3 generations = 30 credits used', me.json.credits);

const del = await call('DELETE', `/songs/${b.id}`);
check(del.status === 204, 'delete song');
check((await call('GET', `/songs/${b.id}`)).status === 404, 'deleted song is gone');

const ledger = await call('GET', '/credits/ledger');
check(ledger.json.entries.filter((e) => e.reason === 'generation').length === 3, 'ledger has one charge per generation', ledger.json);

console.log(`\n🎉 All ${step} end-to-end checks passed`);

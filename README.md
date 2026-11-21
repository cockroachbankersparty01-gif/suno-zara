# Suno Zara — free AI music generation app

Type an idea → get two full song variations (vocals, lyrics, instrumentals).

**100% free:** no paid plans for users, and no paid services for you. Every piece is open-source software
you run yourself, or a free tier:

| Piece | Free choice | Notes |
|---|---|---|
| Music model | **ACE-Step 1.5** (self-hosted) | MIT license, generated music can be used commercially, 50+ languages, runs on consumer GPUs (low-VRAM mode for ~4–6 GB) and Apple Silicon |
| Lyrics / prompt help | **Ollama** (local) | Or any free OpenAI-compatible tier (e.g. Groq). Falls back to built-in templates if the LLM is down |
| Cover art | **Pollinations.ai** | No API key. Anonymous use is rate-limited; falls back to generated gradient covers |
| Database + job queue | **Postgres** (local, or Supabase free tier) | The queue lives in Postgres, so there's **no Redis** to host |
| Auth (email + Google) | **Supabase Auth** free tier | |
| File storage | Local disk, or Supabase Storage free tier | |
| Audio processing | ffmpeg | |
| Apps | Expo + Next.js | Free and open-source |

The one resource that can't be free at unlimited scale is **GPU time**. So users get a free **daily fair-use
quota** (default: 5 generations = 10 songs a day). Nobody ever pays. Set `UNLIMITED_CREDITS=true` to turn the quota off.

**Status:** the backend and the Android app are done. **To get the APK on your phone, follow [`BUILD_APK.md`](BUILD_APK.md).** A web app is optional, later.

## Folder structure

```
suno-zara/
├── docker-compose.yml           # Postgres + Ollama (free, local)
├── supabase/
│   ├── migrations/0001_init.sql # schema, credit functions, job queue, trending view, RLS
│   └── dev_auth_stub.sql        # only for plain local Postgres (Supabase has this built in)
├── backend/                     # Node.js + TypeScript + Express
│   ├── .env.example
│   ├── data/blocklist.txt       # hate/violent phrases (starter list)
│   ├── data/artists.txt         # real artists that must not be imitated
│   └── src/
│       ├── server.ts            # API
│       ├── worker.ts            # generation worker (claims jobs from Postgres)
│       ├── core.test.ts         # 12 tests, no DB/GPU/network needed
│       ├── providers/
│       │   ├── music/           # MusicProvider interface · mock synth · ACE-Step
│       │   ├── lyrics/          # mock · OpenAI-compatible (Ollama / free tiers)
│       │   └── image/           # mock · Pollinations
│       ├── services/            # credits, moderation, storage, song serialization
│       ├── routes/              # generations, songs, social/explore/me, ai helpers
│       ├── middleware/          # auth, rate limits
│       └── lib/                 # audio (WAV/MP3/waveform), errors, seeded random
├── apps/
│   ├── mobile/                  # Expo (React Native) Android app (see apps/mobile/README.md)
│   └── web/                     # optional later: Next.js
├── .github/workflows/build-apk.yml   # free APK build on GitHub
└── BUILD_APK.md                 # step-by-step: server → APK → phone
```

## 1. Run it (mock mode, any computer, ~5 minutes)

Needs Node 20+, Docker and ffmpeg.

```bash
docker compose up -d postgres
cd backend && cp .env.example .env
npm install
npm test                 # 12 tests
npm run dev              # API on :4000
npm run worker           # second terminal
```

```bash
TOKEN="dev:11111111-1111-1111-1111-111111111111"
curl -s -X POST localhost:4000/generations -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"mode":"simple","prompt":"upbeat lo-fi song about monsoon evenings in Mumbai"}'
curl -s localhost:4000/generations/<id> -H "Authorization: Bearer $TOKEN"   # poll until "succeeded"
```

The mock synth makes real, playable tracks, so you can build the whole app before touching a GPU.

## 2. Run the real music model (ACE-Step 1.5, free)

On a machine with an NVIDIA GPU, an Apple Silicon Mac, or (slowly) just a CPU:

```bash
git clone https://github.com/ACE-Step/ACE-Step-1.5.git
cd ACE-Step-1.5
uv sync
uv run acestep-api        # REST API on http://localhost:8001 (models download on first run)
```

Then in `backend/.env`: `MUSIC_PROVIDER=acestep`. Check ACE-Step's README for the low-VRAM settings
that match your GPU.

How the app maps onto ACE-Step:

| App feature | ACE-Step `task_type` |
|---|---|
| Create (2 variations in one call via `batch_size: 2`) | `text2music` |
| Instrumental | lyrics = `[Instrumental]` |
| Extend | `repaint` over the new tail, with the original uploaded as `src_audio` |
| Remix (new style) | `cover` with `audio_cover_strength` 0.6 |

The provider is tested against a fake ACE-Step server, but not yet against the real model. After your
first real runs, tune the extend/remix settings in `providers/music/acestep.ts`.

## 3. Free lyrics + covers

```bash
docker compose up -d ollama
docker compose exec ollama ollama pull llama3.2
```

`.env`: `LYRICS_PROVIDER=openai` (Ollama is the default endpoint) and `IMAGE_PROVIDER=pollinations`.

## 4. Free hosting

The cheapest *reliable* setup is **your own computer** as the GPU server:

- **Your PC / Mac** runs ACE-Step + the worker (+ Ollama). The worker only makes outgoing connections,
  so you don't need to open any ports.
- **Supabase free tier** for Postgres, Auth (email + Google) and Storage. Run `0001_init.sql` in the SQL editor.
  Don't run `dev_auth_stub.sql` there. Create a private bucket `media`, then set `AUTH_MODE=supabase` and
  `STORAGE_DRIVER=supabase`.
- **The API** (small, no GPU) can run on the same PC behind a free **Cloudflare Tunnel**, or on any free Node hosting tier.

When your PC is off, new songs simply wait in the queue (the app shows "waiting in queue"). Everything else
(library, explore, playback) keeps working, because it's all on Supabase.

Free cloud GPU notebooks (Kaggle, Colab) are great for **trying** ACE-Step, but not for serving a public app 24/7:
sessions end after several hours and they aren't meant for hosting services.

## API

All JSON. 🔒 = needs auth.

| Method | Path | What it does |
|---|---|---|
| GET | `/config` | Public settings the app reads on connect (sign-in mode, ToS version) |
| GET 🔒 | `/me` | Profile, free daily quota, ToS status |
| PATCH 🔒 | `/me` | Update username, display name, bio, avatar |
| POST 🔒 | `/me/tos` | Accept terms `{version}` |
| POST 🔒 | `/generations` | Simple `{mode:"simple", prompt, instrumental}` or custom `{mode:"custom", title?, lyrics?, styleTags[], prompt?, instrumental}`. Optional `seed`. → **202** |
| POST 🔒 | `/generations/extend/:songId` | Extend by 30s |
| POST 🔒 | `/generations/remix/:songId` | Same song, new style `{styleTags[]}` |
| GET 🔒 | `/generations?active=true` | Jobs in progress |
| GET 🔒 | `/generations/:id` | Poll: `status`, `progress`, `statusText`, `queuePosition`, then `songs` |
| POST 🔒 | `/ai/lyrics` · `/ai/enhance` | Generate lyrics · expand an idea into a prompt + tags |
| GET 🔒 | `/songs?cursor=&q=` · `/songs/liked` | Library · liked songs |
| GET · PATCH 🔒 · DELETE 🔒 | `/songs/:id` | View · rename/publish · delete |
| GET | `/songs/:id/download` | MP3 download |
| POST | `/songs/:id/play` | Count a play |
| POST/DELETE 🔒 | `/songs/:id/like` | Like / unlike |
| POST 🔒 | `/songs/:id/cover` | New cover art |
| GET | `/explore?tab=trending\|new\|following&tag=` | Explore feed |
| GET | `/s/:slug` | Song behind a share link |
| GET | `/users/:username` · `/users/:username/songs` | Public profile |
| POST/DELETE 🔒 | `/users/:username/follow` | Follow / unfollow |
| GET 🔒 | `/credits/ledger` | Quota history |

Errors look like `{ error, message?, details? }`. The apps need to handle `insufficient_credits` (402: "daily limit reached, come back tomorrow"), `content_blocked` (422), and `too_many_active` / `rate_limited` (429).

## How it works

**Queue (no Redis).** Creating a song inserts a `queued` row in `generations`. Workers claim rows with
`claim_generation()`, which uses `FOR UPDATE SKIP LOCKED`, so it's safe to run several workers. Progress
updates double as heartbeats. A worker that dies has its job re-queued after 10 minutes. Failures retry
with backoff (5s, 10s, 20s), up to 3 attempts.

**Fair-use quota.** Queued jobs reserve credits. They're only deducted, inside the same transaction that saves
the songs, when generation succeeds. Retries can't double-charge. Each user is topped up to 50 once a day.

**Reproducibility.** Every song stores `provider`, `model`, `seed` and `params`. Sending the same `seed` reproduces the result.

**Moderation.** Prompts, lyrics, titles and tags are checked against `data/*.txt`, and LLM-written lyrics are checked too.
Before launch, extend the lists (including Indian languages). [Free open-source classifiers](https://huggingface.co/models?pipeline_tag=text-classification&search=hate)
can run locally to add context-aware checking.

## Before launch
- `AUTH_MODE=supabase` (the server refuses to start in production with dev auth)
- Expanded moderation lists
- Terms of Service: that songs belong to their creators, the fair-use quota, and the content policy

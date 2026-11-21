# Get Suno Zara on your Android phone — step by step

Everything here is free. Budget about an hour the first time.

**What you'll use:** Node.js, Docker Desktop, ffmpeg and Cloudflare Tunnel on your computer, a free GitHub
account to build the APK, and your Android phone.

---

## Part A — Start the server on your computer (15 min)

The app needs this server to make and store songs. It starts in **test mode**, with a built-in practice music
generator, so you can try everything before setting up the real AI.

1. **Install** (one time):
   - Node.js "LTS": https://nodejs.org
   - Docker Desktop: https://www.docker.com/products/docker-desktop (open it once so it's running)
   - ffmpeg: on Windows, open *Terminal* and run `winget install ffmpeg`. On a Mac, run `brew install ffmpeg`.
2. **Unzip** the project and open a terminal **inside the `suno-zara` folder**.
3. Start the database:
   ```
   docker compose up -d postgres
   ```
4. Start the server:
   ```
   cd backend
   copy .env.example .env        (Mac/Linux: cp .env.example .env)
   npm install
   npm run dev
   ```
5. Open a **second** terminal in `suno-zara/backend` and start the song maker:
   ```
   npm run worker
   ```
6. Check it: open http://localhost:4000/config in your browser. You should see `"app":"suno-zara"`.

Keep both terminals open while you use the app.

## Part B — Let your phone reach your computer (5 min)

1. Install Cloudflare Tunnel: `winget install Cloudflare.cloudflared` (Mac: `brew install cloudflared`).
2. Open a **third** terminal and run:
   ```
   cloudflared tunnel --url http://localhost:4000
   ```
3. It prints an address like **`https://some-random-words.trycloudflare.com`**. Copy it, because the app needs it.

This free address **changes each time** you restart the tunnel. That's fine: just enter the new one in the app
under **Profile → Change server**.

## Part C — Build the APK on GitHub (5 min of clicks + ~20 min waiting)

1. Create a free account at https://github.com.
2. Click **+ → New repository**, name it `suno-zara`, and click **Create repository**.
3. On the new repository page, click **uploading an existing file**. Drag in everything that's *inside*
   the `suno-zara` folder (`apps`, `backend`, `supabase`, the README files, and so on), then click **Commit changes**.
4. **Make sure the build file got uploaded.** Some computers hide folders that start with a dot, so `.github` may be missing.
   - Click **Add file → Create new file**.
   - For the name, type exactly: `.github/workflows/build-apk.yml`
   - Open `.github/workflows/build-apk.yml` from the zip in any text editor, then copy and paste its contents.
   - Click **Commit changes**.
5. Click the **Actions** tab. If asked, click **"I understand my workflows, go ahead and enable them"**.
6. Click **Build APK** on the left, then **Run workflow → Run workflow**.
7. Wait for the green ✓ (about 15–25 minutes the first time).
8. Click the finished run and scroll to **Artifacts**. Download **SunoZara-apk** (a zip) and unzip it to get **`SunoZara.apk`**.

If it shows a red ✗ instead: click the failed run, then the red step, and copy the error message. Send it to me and I'll fix it.

## Part D — Install it on your phone (2 min)

1. Get `SunoZara.apk` onto your phone: email it to yourself, use Google Drive, or connect a USB cable.
2. Tap the file. Android asks you to allow installing apps from that source, so tap **Settings → Allow**.
3. Tap **Install**. If Play Protect says "unrecognised app", tap **More details → Install anyway**.
   (It says that because the app isn't from the Play Store, not because something is wrong.)

## Part E — First launch

1. Open **Suno Zara** and paste your `https://….trycloudflare.com` address, then tap **Connect**.
2. Tap **Continue** (test mode), then **I agree**.
3. Go to **Create**, type an idea, and tap **Create 2 songs**. Two songs appear in about a minute. 🎶

In test mode the songs come from a simple built-in synthesizer, so they won't sound like real music yet.
Part F switches on the real AI.

---

## Part F — Upgrades (do these when you're ready)

**Real AI music (ACE-Step 1.5).** This needs an NVIDIA graphics card or an Apple Silicon Mac. See *"Run the real music model"* in
`README.md`, then set `MUSIC_PROVIDER=acestep` in `backend/.env` and restart the server and worker.

**AI lyrics and cover art.** Run `docker compose up -d ollama`, then `docker compose exec ollama ollama pull llama3.2`. Then set
`LYRICS_PROVIDER=openai` and `IMAGE_PROVIDER=pollinations` in `.env`.

**Real accounts, so you can share with friends** (email and Google sign-in, via Supabase's free tier):
1. Create a project at https://supabase.com.
2. In **SQL Editor**, paste and run `supabase/migrations/0001_init.sql`.
3. In **Storage**, create a **private** bucket named `media`.
4. In **Authentication → Providers**, turn on Email (and Google, following Supabase's Google guide).
5. In **Authentication → URL Configuration → Redirect URLs**, add `sunozara://auth-callback`.
6. In `backend/.env`, set:
   ```
   AUTH_MODE=supabase
   STORAGE_DRIVER=supabase
   DATABASE_URL=<Project Settings → Database → connection string>
   SUPABASE_URL=<Project Settings → API → Project URL>
   SUPABASE_ANON_KEY=<Project Settings → API → anon public key>
   SUPABASE_SERVICE_ROLE_KEY=<Project Settings → API → service_role key>   (keep this one secret!)
   ```
7. Restart the server. The app picks up the change automatically the next time it connects, with no new APK needed.

⚠️ Test mode has no passwords: anyone with your tunnel address can make an account. That's fine for trying
the app yourself, but switch to Supabase before sharing it.

## Troubleshooting

| Problem | Fix |
|---|---|
| App says "Can't reach the server" | Are all 3 terminals still running? Is the computer awake? Did the tunnel address change? |
| Songs stay on "Waiting in queue" | The worker terminal (`npm run worker`) isn't running |
| "You've used today's free songs" | Wait until tomorrow, or set `UNLIMITED_CREDITS=true` in `.env` and restart |
| Build failed on GitHub | Send me the red step's error text |
| Install blocked on phone | Settings → Apps → Special access → Install unknown apps → allow your file manager/browser |

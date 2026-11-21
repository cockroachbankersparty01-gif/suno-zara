# Set up the free Suno Zara server — from your phone (about 20 min)

You'll use two free websites: **Supabase** (database, accounts, song storage) and **Render** (runs the server).
Sign in to both **with your GitHub account**, which is the fastest way.

## Part 1 — Supabase (10 min)

1. Open **supabase.com** → **Start your project** → **Continue with GitHub**.
2. Tap **New project**:
   - Name: `suno-zara`
   - Database password: tap **Generate a password**, then **copy it and save it somewhere** (e.g. your notes app). You need it in step 4.
     Letters and numbers only is easiest. If yours has symbols like `@ # / ?`, generate again.
   - Region: **South Asia (Mumbai)** (or Singapore)
   - Tap **Create new project** and wait ~2 minutes.
3. Turn off email confirmation (simpler for now): **Authentication → Sign In / Providers → Email** →
   switch off **Confirm email** → **Save**.
4. Collect 4 values into your notes app:
   - **DATABASE_URL**: tap **Connect** (top of the project page) → **Connection String** → choose **Session pooler** →
     copy the URI. It looks like
     `postgresql://postgres.abcd:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`.
     Replace `[YOUR-PASSWORD]` (including the brackets) with your password from step 2.
   - **SUPABASE_URL**: **Project Settings → Data API** → *Project URL* (`https://abcd.supabase.co`).
   - **SUPABASE_ANON_KEY**: **Project Settings → API Keys** → the **anon / publishable** key.
   - **SUPABASE_SERVICE_ROLE_KEY**: same page → the **service_role / secret** key (tap *Reveal*).
     ⚠️ This one is a master key. Paste it **only** into Render, and never share it.
   (If you see a "Legacy API keys" tab, the `anon` and `service_role` keys there work too.)

You don't need to create tables or storage. The server does that itself on first start.

## Part 2 — Render (10 min)

1. Open **render.com** → **Get Started** → **GitHub**, and allow access to the `suno-zara` repository.
2. Tap **New +** → **Blueprint** → pick **suno-zara** → **Connect**.
3. Render reads the setup file and asks for 4 values. Paste the ones from Part 1:
   `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Tap **Apply** / **Deploy Blueprint**. The first build takes ~5–10 minutes.
5. When it says **Live**, copy your server address from the top of the service page.
   It looks like `https://suno-zara-xxxx.onrender.com`.
   Check it: open `https://suno-zara-xxxx.onrender.com/config` in your browser. You should see `"app":"suno-zara"`.

## Part 3 — The app

1. Open **Suno Zara** → paste the Render address → **Connect**.
   The free server sleeps when unused, so the **first connect can take about a minute**. That's normal.
2. **Create account** with your email and a password → **I agree**.
3. **Create** → type an idea → **Create 2 songs**. 🎶

For now, songs come from the built-in **practice synthesizer** (simple tunes, not real singing yet).
Real AI music (ACE-Step on a free Kaggle GPU) is the next step.

## If something goes wrong

| What you see | What to do |
|---|---|
| Render build failed / "Deploy failed" | Open **Logs** in Render, copy the red lines, and send them to Claude |
| `/config` page doesn't load | Wait 1 minute (waking up) and refresh. Still nothing? Check Render **Logs** |
| Logs say `password authentication failed` | The password in DATABASE_URL is wrong. Fix it in Render → **Environment** |
| Logs say `Configuration problem: … is empty` | One of the 4 values is missing in Render → **Environment** |
| App: "Can't reach the server" | Check the address (must start with `https://`), and wait a minute for the server to wake |

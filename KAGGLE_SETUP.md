# Real AI singing with a free Kaggle GPU — from your phone

Your app's server (Render) has no GPU, so the AI singer runs in a free Kaggle notebook.
While the notebook runs, song requests from the app get made **with real vocals** (Hindi/Hinglish too).
When it's off, requests wait in the queue ("Waiting in line…") until you start it again.

## One-time setup (~10 min)

1. **Kaggle account:** open **kaggle.com** → **Register** (Google sign-in is fine).
2. **Verify your phone** (needed for GPU + internet): profile picture → **Settings** → **Phone verification**.
3. **Open the notebook:** tap this link while signed in:
   https://www.kaggle.com/kernels/welcome?src=https://github.com/cockroachbankersparty01-gif/suno-zara/blob/main/kaggle/suno-zara-gpu-worker.ipynb
   (Tip: in Chrome, ⋮ → **Desktop site** makes Kaggle's editor much easier on a phone.)
4. **Notebook settings** (right panel, or ⋮ → Settings):
   - **Accelerator → GPU T4 x2**
   - **Internet → On**
5. **Secrets:** menu **Add-ons → Secrets** → **Add secret** three times, using the same values as Render:
   - `DATABASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (your new `sb_secret_…` key)
   Make sure the switch next to each one is **on** (attached to this notebook).
   Optional: `GROQ_API_KEY`, a free key from console.groq.com, for AI-written lyrics in Simple mode.

## Every time you want to make songs

- **Quick:** tap **▶▶ Run all** and keep the page open. Wait for **"🎵 Making songs"** (10–15 min the first time).
- **Phone locked / app closed:** **Save Version** (top right) → **Save & Run All (Commit)** → **Save**.
  It runs in the background for `RUN_HOURS` (3 hours by default; change it in the first code cell).

Then open the app → **Create** → your song is made in ~1–2 minutes. 🎶

Kaggle gives roughly **30 free GPU hours per week**. Stop the notebook when you're done to save them.

## If something goes wrong

The notebook stops with a ❌ message that says what to fix:

| Message | Fix |
|---|---|
| No GPU | Settings → Accelerator → GPU T4 x2 |
| No internet | Settings → Internet → On (verify your phone first) |
| Missing secrets | Add-ons → Secrets → add them and switch them on |
| Anything else | Send Claude a screenshot of the red text |

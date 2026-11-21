import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../lib/errors.js';
import { requireAuth, uid } from '../middleware/auth.js';
import { generationLimiter } from '../middleware/rateLimit.js';
import { lyricsProvider } from '../providers/lyrics/index.js';
import { check, moderate } from '../services/moderation.js';
import { HttpError } from '../lib/errors.js';

/** Free helper endpoints for the Create screen. */
export const ai = Router();
ai.use(requireAuth, generationLimiter);

/** POST /ai/lyrics — "Generate lyrics with AI" button. */
ai.post('/lyrics', ah(async (req, res) => {
  const b = z.object({ prompt: z.string().trim().min(3).max(500), styleTags: z.array(z.string().max(40)).max(12).default([]) }).parse(req.body);
  await moderate(uid(req), { prompt: b.prompt, tags: b.styleTags.join(', ') });
  const out = await lyricsProvider().writeLyrics(b.prompt, b.styleTags);
  // Check model output too — LLMs can produce things the input filter wouldn't catch.
  if (check({ lyrics: out.lyrics, title: out.title }).length) throw new HttpError(422, 'content_blocked', 'Try a different idea.');
  res.json(out);
}));

/** POST /ai/enhance — turns a short idea into a richer prompt + style tags. */
ai.post('/enhance', ah(async (req, res) => {
  const b = z.object({ prompt: z.string().trim().min(3).max(500) }).parse(req.body);
  await moderate(uid(req), { prompt: b.prompt });
  res.json(await lyricsProvider().enhancePrompt(b.prompt));
}));

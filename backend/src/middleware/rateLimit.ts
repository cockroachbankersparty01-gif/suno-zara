import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { config } from '../config.js';

// In-memory store: fine for one API instance (the free-hosting setup). If you ever run
// several instances, move limits into Postgres or a shared store.

const key = (req: Request) => req.user?.id ?? req.ip ?? 'anon';

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.limits.requestsPerMinute,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: key,
  message: { error: 'rate_limited' },
});

export const generationLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.limits.generationsPerMinute,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: key,
  message: { error: 'rate_limited', message: 'Slow down a little — try again in a minute.' },
});

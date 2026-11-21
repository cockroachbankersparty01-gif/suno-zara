import { config } from '../config.js';
import { one, query } from '../db.js';
import { HttpError } from '../lib/errors.js';

/** Tops up free daily credits (once per day) and returns the current balance. */
export async function refreshDailyCredits(userId: string): Promise<number> {
  if (config.credits.unlimited) return Number.MAX_SAFE_INTEGER;
  const row = await one<{ credits: number }>('select grant_daily_credits($1, $2) as credits', [
    userId,
    config.credits.dailyFree,
  ]);
  return row?.credits ?? 0;
}

/** Credits minus what's reserved by queued/processing jobs. Nothing is deducted here. */
export async function availableCredits(userId: string): Promise<number> {
  if (config.credits.unlimited) return Number.MAX_SAFE_INTEGER;
  const row = await one<{ n: number }>('select available_credits($1) as n', [userId]);
  return row?.n ?? 0;
}

export async function assertCanAfford(userId: string, cost: number) {
  await refreshDailyCredits(userId);
  const available = await availableCredits(userId);
  if (available < cost) {
    throw new HttpError(402, 'insufficient_credits', `This needs ${cost} credits; you have ${available} available.`, {
      required: cost,
      available,
    });
  }
}

export async function assertConcurrency(userId: string) {
  const row = await one<{ n: string }>(
    `select count(*) as n from generations where user_id = $1 and status in ('queued','processing')`,
    [userId],
  );
  if (Number(row?.n ?? 0) >= config.limits.maxActiveGenerations) {
    throw new HttpError(429, 'too_many_active', 'Wait for your current songs to finish before starting more.');
  }
}


export async function ledger(userId: string, limit = 50) {
  const r = await query(
    `select id, delta, balance_after, reason, generation_id, created_at
       from credit_ledger where user_id = $1 order by id desc limit $2`,
    [userId, limit],
  );
  return r.rows;
}

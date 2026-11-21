import type { NextFunction, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { HttpError } from '../lib/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; email?: string };
    }
  }
}

const supabase =
  config.authMode === 'supabase'
    ? createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false } })
    : null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const knownProfiles = new Set<string>();

async function resolveUser(token: string): Promise<{ id: string; email?: string; name?: string } | null> {
  if (config.authMode === 'dev') {
    const id = token.startsWith('dev:') ? token.slice(4) : '';
    return UUID.test(id) ? { id, email: `${id.slice(0, 8)}@dev.local` } : null;
  }
  const { data, error } = await supabase!.auth.getUser(token);
  if (error || !data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? undefined,
    name: (data.user.user_metadata?.full_name as string | undefined) ?? undefined,
  };
}

/** Creates a profile on first sign-in (email or Google — both come through Supabase Auth). */
async function ensureProfile(u: { id: string; email?: string; name?: string }) {
  if (knownProfiles.has(u.id)) return;
  const exists = await one('select 1 from profiles where id = $1', [u.id]);
  if (!exists) {
    if (config.authMode === 'dev') await query('insert into auth.users (id) values ($1) on conflict do nothing', [u.id]);
    const base = (u.email?.split('@')[0] ?? 'user').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16).padEnd(3, '0');
    const username = `${base}_${u.id.slice(0, 6)}`;
    await query(
      `insert into profiles (id, username, display_name) values ($1, $2, $3) on conflict (id) do nothing`,
      [u.id, username, u.name ?? base],
    );
  }
  knownProfiles.add(u.id);
}

async function authenticate(req: Request) {
  const h = req.header('authorization');
  if (!h?.startsWith('Bearer ')) return null;
  const u = await resolveUser(h.slice(7));
  if (!u) throw new HttpError(401, 'invalid_token');
  await ensureProfile(u);
  return { id: u.id, email: u.email };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const u = req.user ?? (await authenticate(req));
    if (!u) throw new HttpError(401, 'unauthenticated');
    req.user = u;
    next();
  } catch (e) {
    next(e);
  }
}

/** Attaches the user if a valid token is present, but doesn't require one (public pages). */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    req.user = req.user ?? (await authenticate(req)) ?? undefined;
    next();
  } catch (e) {
    next(e);
  }
}

export const uid = (req: Request) => req.user!.id;

-- Suno Zara — initial schema (Supabase / PostgreSQL 15+)
-- Auth users live in Supabase's auth.users; everything app-side hangs off public.profiles.

create extension if not exists "pgcrypto";

-- ───────────── Enums ─────────────
create type generation_type   as enum ('create', 'extend', 'remix');
create type generation_status as enum ('queued', 'processing', 'succeeded', 'failed');
create type song_kind         as enum ('original', 'extension', 'remix');
create type ledger_reason     as enum ('daily_grant', 'generation', 'cover_art', 'refund', 'admin_adjust');

-- ───────────── Profiles ─────────────
create table public.profiles (
  id                      uuid primary key references auth.users(id) on delete cascade,
  username                text unique not null check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name            text,
  avatar_url              text,
  bio                     text check (char_length(bio) <= 280),
  credits                 integer not null default 0 check (credits >= 0),
  daily_credits_granted_on date,
  follower_count          integer not null default 0,
  following_count         integer not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ───────────── Generations (one job → 2 song variations) ─────────────
create table public.generations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  type          generation_type not null default 'create',
  status        generation_status not null default 'queued',
  input         jsonb not null,             -- prompt, lyrics, tags, title, instrumental, source_song_id …
  credits_cost  integer not null check (credits_cost >= 0),
  progress      smallint not null default 0 check (progress between 0 and 100),
  status_text   text,                        -- "composing…", "mixing vocals…"
  error         text,
  -- job-queue bookkeeping (the worker claims rows with FOR UPDATE SKIP LOCKED — no Redis needed)
  attempts      smallint not null default 0,
  max_attempts  smallint not null default 3,
  run_after     timestamptz not null default now(),
  locked_at     timestamptz,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz
);
create index generations_user_idx   on public.generations (user_id, created_at desc);
create index generations_active_idx on public.generations (user_id) where status in ('queued', 'processing');
create index generations_queue_idx  on public.generations (run_after, created_at) where status = 'queued';

-- ───────────── Songs ─────────────
create table public.songs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  generation_id   uuid references public.generations(id) on delete set null,
  variation_index smallint not null default 0,
  kind            song_kind not null default 'original',
  parent_song_id  uuid references public.songs(id) on delete set null,   -- extend / remix source

  title           text not null check (char_length(title) between 1 and 100),
  prompt          text,
  lyrics          text,
  style_tags      text[] not null default '{}',
  is_instrumental boolean not null default false,

  audio_path      text not null,          -- storage key, not a public URL
  cover_path      text,
  duration_sec    numeric(7,2) not null,
  waveform        jsonb,                  -- downsampled peaks for the player

  -- reproducibility
  provider        text not null,          -- 'mock', 'ace-step', …
  model           text not null,
  model_version   text,
  seed            bigint not null,
  params          jsonb not null default '{}',

  is_public       boolean not null default false,
  share_slug      text unique not null default encode(gen_random_bytes(6), 'hex'),
  play_count      integer not null default 0,
  like_count      integer not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz             -- soft delete
);
create index songs_user_idx   on public.songs (user_id, created_at desc) where deleted_at is null;
create index songs_public_new on public.songs (created_at desc) where is_public and deleted_at is null;
create index songs_tags_idx   on public.songs using gin (style_tags);

-- ───────────── Social ─────────────
create table public.likes (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  song_id    uuid not null references public.songs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);
create index likes_song_idx on public.likes (song_id, created_at desc);

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id);

create table public.plays (
  id         bigint generated always as identity primary key,
  song_id    uuid not null references public.songs(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index plays_song_time_idx on public.plays (song_id, created_at desc);
create index plays_time_idx      on public.plays (created_at desc);

-- ───────────── Credits (a free daily fair-use quota — there are no paid plans) ─────────────
create table public.credit_ledger (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  delta         integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  reason        ledger_reason not null,
  generation_id uuid references public.generations(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);
-- A generation can only ever be charged once.
create unique index credit_ledger_one_charge_per_gen
  on public.credit_ledger (generation_id) where reason = 'generation';

-- ───────────── Moderation & legal ─────────────
create table public.moderation_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles(id) on delete set null,
  field      text not null,          -- 'prompt' | 'lyrics' | 'title' | 'tags'
  rule       text not null,          -- which rule tripped
  excerpt    text,
  created_at timestamptz not null default now()
);

create table public.tos_acceptances (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  tos_version text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, tos_version)
);

-- ───────────── Triggers: counters & timestamps ─────────────
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger songs_touch    before update on public.songs    for each row execute function public.touch_updated_at();

create or replace function public.likes_counter() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.songs set like_count = like_count + 1 where id = new.song_id;
  else
    update public.songs set like_count = greatest(like_count - 1, 0) where id = old.song_id;
  end if;
  return null;
end $$;
create trigger likes_count after insert or delete on public.likes for each row execute function public.likes_counter();

create or replace function public.follows_counter() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set follower_count  = follower_count + 1  where id = new.followee_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
  else
    update public.profiles set follower_count  = greatest(follower_count - 1, 0)  where id = old.followee_id;
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
  end if;
  return null;
end $$;
create trigger follows_count after insert or delete on public.follows for each row execute function public.follows_counter();

create or replace function public.plays_counter() returns trigger language plpgsql as $$
begin update public.songs set play_count = play_count + 1 where id = new.song_id; return null; end $$;
create trigger plays_count after insert on public.plays for each row execute function public.plays_counter();

-- ───────────── Credit functions (atomic, row-locked) ─────────────
-- Grants today's free credits once per UTC day. Tops up to the allowance; unused credits don't stack.
create or replace function public.grant_daily_credits(p_user uuid, p_allowance int)
returns integer language plpgsql as $$
declare v_credits int; v_granted date; v_delta int;
begin
  select credits, daily_credits_granted_on into v_credits, v_granted
    from public.profiles where id = p_user for update;
  if v_granted is not distinct from current_date then return v_credits; end if;

  v_delta := greatest(p_allowance - v_credits, 0);
  update public.profiles
     set credits = credits + v_delta, daily_credits_granted_on = current_date
   where id = p_user returning credits into v_credits;
  if v_delta > 0 then
    insert into public.credit_ledger (user_id, delta, balance_after, reason)
    values (p_user, v_delta, v_credits, 'daily_grant');
  end if;
  return v_credits;
end $$;

-- Charges a generation exactly once. Called only after the provider succeeded.
create or replace function public.charge_generation(p_generation uuid)
returns integer language plpgsql as $$
declare v_user uuid; v_cost int; v_credits int;
begin
  select user_id, credits_cost into v_user, v_cost from public.generations where id = p_generation;
  if v_user is null then raise exception 'generation % not found', p_generation; end if;
  if v_cost = 0 then  -- unlimited mode: nothing to charge
    select credits into v_credits from public.profiles where id = v_user;
    return v_credits;
  end if;
  if exists (select 1 from public.credit_ledger where generation_id = p_generation and reason = 'generation') then
    select credits into v_credits from public.profiles where id = v_user;
    return v_credits;   -- idempotent: already charged (e.g. worker retry)
  end if;

  update public.profiles set credits = credits - v_cost
   where id = v_user and credits >= v_cost returning credits into v_credits;
  if v_credits is null then raise exception 'insufficient_credits'; end if;

  insert into public.credit_ledger (user_id, delta, balance_after, reason, generation_id)
  values (v_user, -v_cost, v_credits, 'generation', p_generation);
  return v_credits;
end $$;

-- Credits currently "spoken for" by jobs that haven't finished, so users can't queue more than they can pay for.
create or replace function public.available_credits(p_user uuid)
returns integer language sql stable as $$
  select p.credits - coalesce((
    select sum(g.credits_cost) from public.generations g
     where g.user_id = p_user and g.status in ('queued', 'processing')), 0)
  from public.profiles p where p.id = p_user
$$;

-- ───────────── Trending view (likes + recent plays, time-decayed) ─────────────
create or replace view public.trending_songs as
select s.*,
       (s.like_count * 3 + coalesce(rp.recent_plays, 0))
         / power(extract(epoch from (now() - s.created_at)) / 3600 + 2, 1.5) as trend_score
  from public.songs s
  left join (
    select song_id, count(*) as recent_plays
      from public.plays where created_at > now() - interval '7 days'
     group by song_id
  ) rp on rp.song_id = s.id
 where s.is_public and s.deleted_at is null;

-- ───────────── Row Level Security ─────────────
-- The backend uses the service role (bypasses RLS). These policies protect direct client access.
alter table public.profiles          enable row level security;
alter table public.songs             enable row level security;
alter table public.generations       enable row level security;
alter table public.likes             enable row level security;
alter table public.follows           enable row level security;
alter table public.plays             enable row level security;
alter table public.credit_ledger     enable row level security;
alter table public.moderation_events enable row level security;
alter table public.tos_acceptances   enable row level security;

create policy profiles_read   on public.profiles for select using (true);
create policy profiles_update on public.profiles for update using (auth.uid() = id);

create policy songs_read on public.songs for select
  using (deleted_at is null and (is_public or user_id = auth.uid()));

create policy generations_own on public.generations for select using (user_id = auth.uid());
create policy likes_read      on public.likes   for select using (true);
create policy follows_read    on public.follows for select using (true);
create policy ledger_own      on public.credit_ledger for select using (user_id = auth.uid());
create policy tos_own         on public.tos_acceptances for select using (user_id = auth.uid());

-- Spend credits for a synchronous action (e.g. cover art) — call only after the action succeeded.
create or replace function public.spend_credits(p_user uuid, p_amount int, p_reason ledger_reason)
returns integer language plpgsql as $$
declare v_credits int;
begin
  update public.profiles set credits = credits - p_amount
   where id = p_user and credits >= p_amount returning credits into v_credits;
  if v_credits is null then raise exception 'insufficient_credits'; end if;
  insert into public.credit_ledger (user_id, delta, balance_after, reason)
  values (p_user, -p_amount, v_credits, p_reason);
  return v_credits;
end $$;

-- ───────────── Job queue (replaces Redis/BullMQ) ─────────────
-- Atomically claims the next runnable generation. Safe with many workers.
create or replace function public.claim_generation()
returns setof public.generations language sql as $$
  update public.generations g
     set status = 'processing', attempts = g.attempts + 1, locked_at = now(),
         started_at = coalesce(g.started_at, now()), status_text = 'Composing…', error = null
   where g.id = (
     select id from public.generations
      where status = 'queued' and run_after <= now()
      order by created_at
      for update skip locked
      limit 1)
  returning g.*
$$;

-- Puts jobs whose worker died (no heartbeat for p_stale) back in the queue, or fails them if out of attempts.
create or replace function public.requeue_stale_generations(p_stale interval default '10 minutes')
returns integer language plpgsql as $$
declare n int;
begin
  update public.generations
     set status = case when attempts >= max_attempts then 'failed'::generation_status else 'queued'::generation_status end,
         status_text = case when attempts >= max_attempts then 'Failed — no credits were used' else 'Retrying…' end,
         error = coalesce(error, 'worker timed out'),
         completed_at = case when attempts >= max_attempts then now() end,
         locked_at = null
   where status = 'processing' and locked_at < now() - p_stale;
  get diagnostics n = row_count;
  return n;
end $$;

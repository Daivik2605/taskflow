-- TaskFlow (PersonalOS "taskflow") — Supabase schema, phase 1 (every table; views and functions come in later phases)
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once, and never drops data. Every row belongs to the signed-in user; Row Level Security keeps it private.
-- This app only creates objects starting with taskflow_ / taskflow-. Never touch another app's objects.
-- Later phases EXTEND this file (phase 5: taskflow_end_reset, phase 11: taskflow_dashboard_* views). Never rewrite it.

-- ───────────── Shared trigger functions ─────────────
create or replace function public.taskflow_set_updated_at() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────── Areas and projects ─────────────
create table if not exists public.taskflow_areas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  kind        text not null default 'life'
              check (kind in ('focus','work','wellbeing','leisure','social','sleep','life')),
  app_key     text,                                  -- linked app, e.g. 'dsa', 'trading'
  color       text not null default '#64748b',
  sort        int  not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.taskflow_projects (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name             text not null,
  area_id          uuid references public.taskflow_areas(id) on delete set null,
  summary          text,
  why              text,
  location         text,                             -- folder / repo / URL
  status           text not null default 'idea'
                   check (status in ('idea','active','paused','done','dropped')),
  whats_left       text,
  next_step        text,
  started_on       date,
  last_touched_at  timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, name)
);

-- ───────────── Tasks and notes (tasks.from_note_id gets its FK once notes exists, below) ─────────────
create table if not exists public.taskflow_tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title         text not null,
  description   text,
  area_id       uuid references public.taskflow_areas(id) on delete set null,
  project_id    uuid references public.taskflow_projects(id) on delete set null,
  parent_id     uuid references public.taskflow_tasks(id) on delete cascade,   -- sub-tasks
  due_on        date,                                -- Toronto calendar date
  priority      int  not null default 2 check (priority between 1 and 3),
  status        text not null default 'todo' check (status in ('todo','doing','done','dropped')),
  owner         text not null default 'me',          -- free text: me, Anikait, external…
  waiting_on    text,
  tags          text[] not null default '{}',
  completed_at  timestamptz,
  sort          int  not null default 0,
  from_note_id  uuid,                                -- FK added after taskflow_notes exists
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.taskflow_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null default 'idea' check (kind in ('idea','research','remember','link')),
  title       text not null,
  body        text not null default '',              -- markdown
  url         text,
  area_id     uuid references public.taskflow_areas(id) on delete set null,
  project_id  uuid references public.taskflow_projects(id) on delete set null,
  task_id     uuid references public.taskflow_tasks(id) on delete set null,
  pinned      boolean not null default false,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'taskflow_tasks_from_note_fk') then
    alter table public.taskflow_tasks
      add constraint taskflow_tasks_from_note_fk
      foreign key (from_note_id) references public.taskflow_notes(id) on delete set null;
  end if;
end $$;

-- ───────────── Timer ─────────────
create table if not exists public.taskflow_presets (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name             text not null,
  area_id          uuid not null references public.taskflow_areas(id) on delete restrict,
  default_minutes  int  not null check (default_minutes > 0),
  sort             int  not null default 0,
  archived         boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.taskflow_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  area_id     uuid not null references public.taskflow_areas(id) on delete restrict,
  task_id     uuid references public.taskflow_tasks(id) on delete set null,
  source      text not null default 'timer' check (source in ('timer','manual','preset')),
  preset_id   uuid references public.taskflow_presets(id) on delete set null,
  comment     text,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  state       text not null default 'running' check (state in ('running','paused','stopped')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.taskflow_session_segments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id  uuid not null references public.taskflow_sessions(id) on delete cascade,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ───────────── Actions, resets ─────────────
create table if not exists public.taskflow_actions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key         text not null,                         -- shift:<job_id> · nap_reset · preset:<id> · sleep_checkin
  label       text not null,
  pinned      boolean not null default true,
  sort        int  not null default 0,
  hidden      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, key)
);

create table if not exists public.taskflow_resets (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  started_at       timestamptz not null,
  nap_ended_at     timestamptz,
  ended_at         timestamptz,
  ended_by         text check (ended_by in ('manual','taskflow_timer','shift_punch_in','app','auto_check')),
  ended_by_app     text,
  ended_by_detail  text,
  had_nap          boolean not null default false,
  edited           boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ───────────── Work: jobs, shifts, breaks, paystubs ─────────────
-- hourly_rate and pay_period_anchor stay NULL until the user sets them (phase 6); the UI says so wherever pay is shown.
create table if not exists public.taskflow_jobs (
  id                               uuid primary key default gen_random_uuid(),
  user_id                          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  employer                         text not null,
  area_id                          uuid not null references public.taskflow_areas(id) on delete restrict,
  hourly_rate                      numeric check (hourly_rate is null or hourly_rate >= 0),
  pay_period_days                  int  not null default 14 check (pay_period_days > 0),
  pay_period_anchor                date,
  clock_in_round_minutes           int  not null default 5  check (clock_in_round_minutes >= 0),
  clock_in_round_mode              text not null default 'up' check (clock_in_round_mode in ('up','down','nearest','none')),
  clock_out_round_minutes          int  not null default 0  check (clock_out_round_minutes >= 0),
  clock_out_round_mode             text not null default 'none' check (clock_out_round_mode in ('up','down','nearest','none')),
  early_clock_in_paid              boolean not null default false,
  break_paid                       boolean not null default false,
  break_expected_minutes           int  not null default 30 check (break_expected_minutes >= 0),
  break_required_after_minutes     int  not null default 300 check (break_required_after_minutes >= 0),
  overtime_after_weekly_minutes    int  not null default 2640 check (overtime_after_weekly_minutes >= 0),
  overtime_multiplier              numeric not null default 1.5 check (overtime_multiplier >= 1),
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now(),
  unique (user_id, employer)
);

create table if not exists public.taskflow_shifts (
  id                           uuid primary key default gen_random_uuid(),
  user_id                      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id                       uuid not null references public.taskflow_jobs(id) on delete cascade,
  day                          date not null,        -- Toronto date the shift started
  scheduled_start              timestamptz,
  scheduled_end                timestamptz,
  clock_in_at                  timestamptz not null,
  clock_out_at                 timestamptz,
  state                        text not null default 'on_shift' check (state in ('on_shift','on_break','done')),
  store_clock_in_at            timestamptz,
  store_clock_out_at           timestamptz,
  store_break_minutes          int check (store_break_minutes is null or store_break_minutes >= 0),
  break_status                 text check (break_status in ('taken','skipped','left_on_break')),
  manager_said_no_deduction    boolean not null default false,
  verified                     boolean not null default false,
  notes                        text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create table if not exists public.taskflow_shift_breaks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  shift_id    uuid not null references public.taskflow_shifts(id) on delete cascade,
  started_at  timestamptz,
  ended_at    timestamptz,
  source      text not null default 'live' check (source in ('live','manual')),
  minutes     int check (minutes is null or minutes >= 0),   -- manual entry without times
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.taskflow_paystubs (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id                 uuid not null references public.taskflow_jobs(id) on delete cascade,
  period_start           date not null,
  period_end             date not null,
  pay_date               date,
  paid_regular_minutes   int  not null default 0 check (paid_regular_minutes >= 0),
  paid_overtime_minutes  int  not null default 0 check (paid_overtime_minutes >= 0),
  gross_pay              numeric,
  net_pay                numeric,
  notes                  text,
  file_path              text,                       -- in the taskflow-paystubs bucket
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id, job_id, period_start)
);

-- ───────────── Calendar, sleep, settings ─────────────
create table if not exists public.taskflow_days_off (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day         date not null,
  kind        text not null default 'rest' check (kind in ('holiday','vacation','sick','rest')),
  label       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, day)
);

create table if not exists public.taskflow_sleep (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day         date not null,                         -- the wake-up day
  bed_at      timestamptz not null,
  wake_at     timestamptz not null,
  minutes     int generated always as ((extract(epoch from (wake_at - bed_at)) / 60)::int) stored,
  quality     int check (quality between 1 and 5),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, day),
  check (wake_at > bed_at)
);

create table if not exists public.taskflow_settings (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  theme                       text not null default 'system' check (theme in ('system','light','dark')),
  reset_check_hours           int  not null default 4  check (reset_check_hours > 0),
  cold_project_days           int  not null default 30 check (cold_project_days > 0),
  taskflow_url                text,
  paystub_tolerance_minutes   int  not null default 15 check (paystub_tolerance_minutes >= 0),
  paystub_tolerance_dollars   numeric not null default 5 check (paystub_tolerance_dollars >= 0),
  seeded_at                   timestamptz,           -- set last by the first-sign-in seed; seed runs only while null
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (user_id)
);

-- ───────────── Indexes ─────────────
create index if not exists taskflow_tasks_user_due      on public.taskflow_tasks (user_id, due_on);
create index if not exists taskflow_tasks_project       on public.taskflow_tasks (project_id);
create index if not exists taskflow_tasks_parent        on public.taskflow_tasks (parent_id);
create index if not exists taskflow_tasks_area          on public.taskflow_tasks (area_id);
create index if not exists taskflow_sessions_user_start on public.taskflow_sessions (user_id, started_at);
create index if not exists taskflow_sessions_task       on public.taskflow_sessions (task_id);
create index if not exists taskflow_segments_session    on public.taskflow_session_segments (session_id);
create index if not exists taskflow_segments_user_start on public.taskflow_session_segments (user_id, started_at);
create index if not exists taskflow_resets_user_start   on public.taskflow_resets (user_id, started_at);
create index if not exists taskflow_shifts_user_day     on public.taskflow_shifts (user_id, day);
create index if not exists taskflow_shifts_job          on public.taskflow_shifts (job_id);
create index if not exists taskflow_breaks_shift        on public.taskflow_shift_breaks (shift_id);
create index if not exists taskflow_notes_user_created  on public.taskflow_notes (user_id, created_at desc);
create index if not exists taskflow_notes_project       on public.taskflow_notes (project_id);
create index if not exists taskflow_sleep_user_day      on public.taskflow_sleep (user_id, day);
create index if not exists taskflow_days_off_user_day   on public.taskflow_days_off (user_id, day);

-- One running/paused session, one open segment per session, one open reset, one open shift — per user.
create unique index if not exists taskflow_one_active_session on public.taskflow_sessions (user_id) where state <> 'stopped';
create unique index if not exists taskflow_one_open_segment   on public.taskflow_session_segments (session_id) where ended_at is null;
create unique index if not exists taskflow_one_open_reset     on public.taskflow_resets (user_id) where ended_at is null;
create unique index if not exists taskflow_one_open_shift     on public.taskflow_shifts (user_id) where state <> 'done';

-- ───────────── Triggers ─────────────
-- A write to a task or note that has a project bumps the project's last_touched_at; a session does it through its task.
create or replace function public.taskflow_touch_project() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.project_id is not null then
    update public.taskflow_projects set last_touched_at = now() where id = new.project_id;
  end if;
  return new;
end $$;

create or replace function public.taskflow_touch_project_from_session() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.task_id is not null then
    update public.taskflow_projects set last_touched_at = now()
    where id = (select t.project_id from public.taskflow_tasks t where t.id = new.task_id);
  end if;
  return new;
end $$;

drop trigger if exists taskflow_touch_project on public.taskflow_tasks;
create trigger taskflow_touch_project after insert or update on public.taskflow_tasks
  for each row execute function public.taskflow_touch_project();
drop trigger if exists taskflow_touch_project on public.taskflow_notes;
create trigger taskflow_touch_project after insert or update on public.taskflow_notes
  for each row execute function public.taskflow_touch_project();
drop trigger if exists taskflow_touch_project on public.taskflow_sessions;
create trigger taskflow_touch_project after insert or update on public.taskflow_sessions
  for each row execute function public.taskflow_touch_project_from_session();

-- ───────────── updated_at trigger, RLS and "own rows" policy on every table ─────────────
do $$
declare t text;
begin
  foreach t in array array[
    'taskflow_areas','taskflow_projects','taskflow_tasks','taskflow_notes','taskflow_presets',
    'taskflow_sessions','taskflow_session_segments','taskflow_actions','taskflow_resets',
    'taskflow_jobs','taskflow_shifts','taskflow_shift_breaks','taskflow_paystubs',
    'taskflow_days_off','taskflow_sleep','taskflow_settings'
  ] loop
    execute format('drop trigger if exists taskflow_set_updated_at on public.%I', t);
    execute format('create trigger taskflow_set_updated_at before update on public.%I
                    for each row execute function public.taskflow_set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ───────────── Realtime: tables that change on another device ─────────────
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'taskflow_tasks','taskflow_sessions','taskflow_session_segments','taskflow_resets',
      'taskflow_shifts','taskflow_shift_breaks','taskflow_notes'
    ] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ───────────── Storage: private buckets, files under <user_id>/… ─────────────
insert into storage.buckets (id, name, public)
values ('taskflow-paystubs', 'taskflow-paystubs', false),
       ('taskflow-timecards', 'taskflow-timecards', false)
on conflict (id) do nothing;

drop policy if exists "taskflow own files" on storage.objects;
create policy "taskflow own files" on storage.objects for all to authenticated
  using (bucket_id in ('taskflow-paystubs','taskflow-timecards')
         and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id in ('taskflow-paystubs','taskflow-timecards')
         and (storage.foldername(name))[1] = (select auth.uid())::text);


-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- Revision 2 (phase 2.5): tag tree, task dates, counters, week start.
-- Everything above is unchanged. Everything below is safe to re-run; the data migration inside the DO block runs once
-- (while the old `kind` check exists), in a single transaction-sized block, and only UPDATES / INSERTS rows — it never deletes.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════

do $$ begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'TaskFlow revision 2 needs Postgres 15 or newer (unique ... nulls not distinct). Nothing was changed.';
  end if;
end $$;

-- ───────────── New columns ─────────────
alter table public.taskflow_areas add column if not exists parent_id uuid references public.taskflow_areas(id) on delete restrict;
alter table public.taskflow_areas add column if not exists emoji text;

alter table public.taskflow_tasks add column if not exists start_on date;
alter table public.taskflow_tasks add column if not exists hard_deadline boolean not null default false;
alter table public.taskflow_tasks add column if not exists estimate_minutes int;

alter table public.taskflow_settings add column if not exists week_starts_on int not null default 1;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'taskflow_tasks_start_before_due') then
    alter table public.taskflow_tasks add constraint taskflow_tasks_start_before_due
      check (start_on is null or due_on is null or start_on <= due_on);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'taskflow_tasks_deadline_needs_due') then
    alter table public.taskflow_tasks add constraint taskflow_tasks_deadline_needs_due
      check (not hard_deadline or due_on is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'taskflow_tasks_estimate_positive') then
    alter table public.taskflow_tasks add constraint taskflow_tasks_estimate_positive
      check (estimate_minutes is null or estimate_minutes > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'taskflow_settings_week_starts_on_range') then
    alter table public.taskflow_settings add constraint taskflow_settings_week_starts_on_range
      check (week_starts_on between 0 and 6);   -- 0 = Sunday, 1 = Monday … 6 = Saturday
  end if;
end $$;

create index if not exists taskflow_tasks_user_start on public.taskflow_tasks (user_id, start_on);

-- ───────────── New tables: counters, counter events, migration log ─────────────
create table if not exists public.taskflow_counters (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  emoji       text,
  color       text not null default '#64748b',
  sort        int  not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.taskflow_counter_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  counter_id  uuid not null references public.taskflow_counters(id) on delete restrict,
  at          timestamptz not null default now(),
  day         date not null,                         -- Toronto date of `at`; kept in step by a trigger
  qty         int  not null default 1 check (qty > 0),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists taskflow_counter_events_user_day on public.taskflow_counter_events (user_id, day);
create index if not exists taskflow_counter_events_counter  on public.taskflow_counter_events (counter_id);

-- Before-images of every row the data migration changed, so it can be reversed by hand if ever needed.
create table if not exists public.taskflow_migration_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  migration   text not null,
  table_name  text not null,
  row_id      uuid not null,
  before      jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists taskflow_migration_log_user on public.taskflow_migration_log (user_id, migration);

create or replace function public.taskflow_set_event_day() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  new.day := (new.at at time zone 'America/Toronto')::date;
  return new;
end $$;

drop trigger if exists taskflow_set_event_day on public.taskflow_counter_events;
create trigger taskflow_set_event_day before insert or update of at on public.taskflow_counter_events
  for each row execute function public.taskflow_set_event_day();

do $$
declare t text;
begin
  foreach t in array array['taskflow_counters','taskflow_counter_events'] loop
    execute format('drop trigger if exists taskflow_set_updated_at on public.%I', t);
    execute format('create trigger taskflow_set_updated_at before update on public.%I
                    for each row execute function public.taskflow_set_updated_at()', t);
  end loop;
  foreach t in array array['taskflow_counters','taskflow_counter_events','taskflow_migration_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ───────────── Data migration: flat areas → two-level tag tree (runs once, in place, ids kept) ─────────────
-- Helpers live in pg_temp (this session only) and are dropped at the end.
-- Point everything that references tag p_from at p_to (logging each changed row first).
create or replace function pg_temp.tf_retag(p_user uuid, p_from uuid, p_to uuid) returns void
language plpgsql as $$
declare t text;
begin
  foreach t in array array['taskflow_tasks','taskflow_presets','taskflow_sessions','taskflow_notes','taskflow_projects','taskflow_jobs'] loop
    execute format($f$insert into public.taskflow_migration_log (user_id, migration, table_name, row_id, before)
                      select user_id, 'phase-2.5', %L, id, jsonb_build_object('area_id', area_id)
                      from public.%I where user_id = $1 and area_id = $2$f$, t, t) using p_user, p_from;
    execute format('update public.%I set area_id = $2 where user_id = $1 and area_id = $3', t) using p_user, p_to, p_from;
  end loop;
end $$;

-- Find or create a tag by (parent, name).
create or replace function pg_temp.tf_tag(p_user uuid, p_parent uuid, p_name text, p_kind text, p_color text, p_emoji text, p_sort int, p_app text default null)
returns uuid language plpgsql as $$
declare rid uuid;
begin
  select id into rid from public.taskflow_areas where user_id = p_user and parent_id is not distinct from p_parent and name = p_name;
  if rid is null then
    insert into public.taskflow_areas (user_id, parent_id, name, kind, color, emoji, sort, app_key)
    values (p_user, p_parent, p_name, p_kind, p_color, p_emoji, p_sort, p_app) returning id into rid;
  else
    update public.taskflow_areas set emoji = coalesce(emoji, p_emoji), sort = p_sort,
           app_key = coalesce(app_key, p_app) where id = rid;
  end if;
  return rid;
end $$;

-- Move/rename an existing top-level tag in place; if the destination already exists, merge into it and archive the old one.
create or replace function pg_temp.tf_place(p_user uuid, p_old text, p_parent uuid, p_new text, p_kind text) returns void
language plpgsql as $$
declare rid uuid; other uuid;
begin
  select id into rid from public.taskflow_areas where user_id = p_user and parent_id is null and name = p_old;
  if rid is null then return; end if;
  select id into other from public.taskflow_areas
   where user_id = p_user and parent_id is not distinct from p_parent and name = p_new and id <> rid;
  if other is not null then
    perform pg_temp.tf_retag(p_user, rid, other);
    update public.taskflow_areas set archived = true, kind = p_kind where id = rid;
  else
    update public.taskflow_areas set parent_id = p_parent, name = p_new, kind = p_kind where id = rid;
  end if;
end $$;

-- Rename a top-level tag in place (or create it) and return its id.
create or replace function pg_temp.tf_parent(p_user uuid, p_old text, p_new text, p_kind text, p_color text, p_emoji text, p_sort int) returns uuid
language plpgsql as $$
declare rid uuid;
begin
  select id into rid from public.taskflow_areas where user_id = p_user and parent_id is null and name = p_new;
  if rid is null and p_old is not null then
    select id into rid from public.taskflow_areas where user_id = p_user and parent_id is null and name = p_old;
    if rid is not null then
      update public.taskflow_areas set name = p_new where id = rid;
    end if;
  end if;
  return pg_temp.tf_tag(p_user, null, p_new, p_kind, p_color, p_emoji, p_sort);
end $$;

do $$
declare
  u uuid;
  n_before jsonb; n_after jsonb;
  p_work uuid; p_hustle uuid; p_study uuid; p_wellness uuid; p_break uuid; p_sleep uuid; p_personal uuid;
  rid uuid; old_projects uuid; leisure uuid; people uuid;
  job uuid; oland_tag uuid; oland_job uuid; shift_sort int; tim_job uuid; kriya uuid; padma uuid;
  r record;
begin
  -- Guard: the old kind check is only present until this block has run.
  if not exists (select 1 from pg_constraint where conname = 'taskflow_areas_kind_check' and conrelid = 'public.taskflow_areas'::regclass) then
    return;
  end if;

  alter table public.taskflow_areas drop constraint taskflow_areas_kind_check;
  alter table public.taskflow_areas drop constraint if exists taskflow_areas_user_id_name_key;

  for u in select distinct user_id from public.taskflow_areas loop
    select jsonb_build_object(
      'tasks', (select count(*) from public.taskflow_tasks where user_id = u),
      'presets', (select count(*) from public.taskflow_presets where user_id = u),
      'projects', (select count(*) from public.taskflow_projects where user_id = u),
      'sessions', (select count(*) from public.taskflow_sessions where user_id = u),
      'notes', (select count(*) from public.taskflow_notes where user_id = u),
      'jobs', (select count(*) from public.taskflow_jobs where user_id = u),
      'actions', (select count(*) from public.taskflow_actions where user_id = u),
      'areas', (select count(*) from public.taskflow_areas where user_id = u)) into n_before;

    -- before-images
    insert into public.taskflow_migration_log (user_id, migration, table_name, row_id, before)
      select user_id, 'phase-2.5', 'taskflow_areas', id, to_jsonb(a) from public.taskflow_areas a where user_id = u;
    insert into public.taskflow_migration_log (user_id, migration, table_name, row_id, before)
      select user_id, 'phase-2.5', 'taskflow_presets', id, to_jsonb(p) from public.taskflow_presets p where user_id = u;
    insert into public.taskflow_migration_log (user_id, migration, table_name, row_id, before)
      select user_id, 'phase-2.5', 'taskflow_actions', id, to_jsonb(a) from public.taskflow_actions a where user_id = u;

    -- parents (rename in place when the old row exists)
    p_work     := pg_temp.tf_tag(u, null, 'Work',   'work',   '#dc2626', '💼', 0);
    p_hustle   := pg_temp.tf_tag(u, null, 'Hustle', 'hustle', '#8b5cf6', '🚀', 1);
    p_study    := pg_temp.tf_tag(u, null, 'Study',  'study',  '#6366f1', '📚', 2);
    p_wellness := pg_temp.tf_parent(u, 'Wellbeing', 'Wellness', 'wellness', '#22c55e', '🧘', 3);
    p_break    := pg_temp.tf_tag(u, null, 'Break',  'break',  '#f59e0b', '☕', 4);
    p_sleep    := pg_temp.tf_parent(u, 'Sleep', 'Sleep', 'sleep', '#64748b', '😴', 5);
    p_personal := pg_temp.tf_parent(u, 'Life admin', 'Personal', 'personal', '#a3a3a3', '🏠', 6);
    update public.taskflow_areas set kind = 'work' where id = p_work;
    update public.taskflow_areas set kind = 'hustle' where id = p_hustle;
    update public.taskflow_areas set kind = 'study' where id = p_study;
    update public.taskflow_areas set kind = 'wellness' where id = p_wellness;
    update public.taskflow_areas set kind = 'break' where id = p_break;
    update public.taskflow_areas set kind = 'sleep' where id = p_sleep;
    update public.taskflow_areas set kind = 'personal' where id = p_personal;

    -- sub-tags: an existing top-level row (by its new name, then by its old name) is moved in place; missing ones are created
    perform pg_temp.tf_place(u, 'DSA', p_study, 'DSA', 'study');
    perform pg_temp.tf_place(u, 'Trading', p_study, 'Trading', 'study');
    perform pg_temp.tf_place(u, 'SQL', p_study, 'SQL', 'study');
    perform pg_temp.tf_place(u, 'Tableau Data Analyst Certification', p_study, 'Tableau Data Analyst Certification', 'study');
    perform pg_temp.tf_place(u, 'Tableau cert', p_study, 'Tableau Data Analyst Certification', 'study');
    perform pg_temp.tf_place(u, 'Databricks Data Analyst Certification', p_study, 'Databricks Data Analyst Certification', 'study');
    perform pg_temp.tf_place(u, 'Databricks cert', p_study, 'Databricks Data Analyst Certification', 'study');
    perform pg_temp.tf_place(u, 'AEO Studio', p_hustle, 'AEO Studio', 'hustle');
    perform pg_temp.tf_place(u, 'Tim Hortons', p_work, 'Tim Hortons', 'work');
    perform pg_temp.tf_place(u, 'Work — Tim Hortons', p_work, 'Tim Hortons', 'work');
    perform pg_temp.tf_place(u, 'Oland Stations', p_work, 'Oland Stations', 'work');
    perform pg_temp.tf_place(u, 'Commute', p_work, 'Commute', 'work');
    perform pg_temp.tf_place(u, 'Kriya', p_wellness, 'Kriya', 'wellness');
    perform pg_temp.tf_place(u, 'Padmasadna', p_wellness, 'Padmasadna', 'wellness');
    perform pg_temp.tf_place(u, 'Home Workout', p_wellness, 'Home Workout', 'wellness');
    perform pg_temp.tf_place(u, 'Gym', p_wellness, 'Gym', 'wellness');

    perform pg_temp.tf_tag(u, p_study, 'DSA', 'study', '#6366f1', '🧩', 0, 'dsa');
    perform pg_temp.tf_tag(u, p_study, 'SQL', 'study', '#0ea5e9', '🗄️', 1);
    perform pg_temp.tf_tag(u, p_study, 'Trading', 'study', '#10b981', '📈', 2, 'trading');
    perform pg_temp.tf_tag(u, p_study, 'Tableau Data Analyst Certification', 'study', '#3b82f6', '📊', 3);
    perform pg_temp.tf_tag(u, p_study, 'Databricks Data Analyst Certification', 'study', '#ef4444', '🧱', 4);
    perform pg_temp.tf_tag(u, p_hustle, 'AEO Studio', 'hustle', '#8b5cf6', '🧠', 0);
    perform pg_temp.tf_tag(u, p_work, 'Tim Hortons', 'work', '#dc2626', '🍩', 0);
    oland_tag := pg_temp.tf_tag(u, p_work, 'Oland Stations', 'work', '#f97316', '⛽', 1);
    perform pg_temp.tf_tag(u, p_work, 'Commute', 'work', '#78716c', '🚌', 2);
    kriya := pg_temp.tf_tag(u, p_wellness, 'Kriya', 'wellness', '#22c55e', '🌬️', 0);
    padma := pg_temp.tf_tag(u, p_wellness, 'Padmasadna', 'wellness', '#14b8a6', '🪷', 1);
    perform pg_temp.tf_tag(u, p_wellness, 'Home Workout', 'wellness', '#ef4444', '💪', 2);
    perform pg_temp.tf_tag(u, p_wellness, 'Gym', 'wellness', '#f97316', '🏋️', 3);

    -- archived tags: their tasks, presets, sessions, notes, projects and jobs move to the new home
    select id into old_projects from public.taskflow_areas where user_id = u and parent_id is null and name = 'Projects';
    if old_projects is not null then
      perform pg_temp.tf_retag(u, old_projects, p_personal);
      update public.taskflow_areas set archived = true, kind = 'personal' where id = old_projects;
    end if;
    select id into leisure from public.taskflow_areas where user_id = u and parent_id is null and name = 'Leisure';
    if leisure is not null then
      perform pg_temp.tf_retag(u, leisure, p_break);
      update public.taskflow_areas set archived = true, kind = 'break' where id = leisure;
    end if;
    select id into people from public.taskflow_areas where user_id = u and parent_id is null and name = 'People';
    if people is not null then
      perform pg_temp.tf_retag(u, people, p_break);
      update public.taskflow_areas set archived = true, kind = 'break' where id = people;
    end if;

    -- anything else you created yourself stays a top-level tag with its kind mapped
    update public.taskflow_areas set kind = case kind
        when 'focus' then 'study' when 'wellbeing' then 'wellness' when 'leisure' then 'break'
        when 'social' then 'break' when 'life' then 'personal' else kind end
      where user_id = u and kind in ('focus','wellbeing','leisure','social','life');

    -- presets → Wellness / Kriya and Wellness / Padmasadna (renamed), and their action buttons follow
    for r in select id, name from public.taskflow_presets where user_id = u and name in ('Sudarshan Kriya','Padmasadhna') loop
      update public.taskflow_presets
         set name = case r.name when 'Sudarshan Kriya' then 'Kriya' else 'Padmasadna' end,
             area_id = case r.name when 'Sudarshan Kriya' then kriya else padma end
       where id = r.id;
      update public.taskflow_actions
         set label = case r.name when 'Sudarshan Kriya' then 'Kriya' else 'Padmasadna' end
       where user_id = u and key = 'preset:' || r.id::text and label = r.name;
    end loop;

    -- second job and its shift action (right after the Tim Hortons one)
    select id into tim_job from public.taskflow_jobs where user_id = u and employer = 'Tim Hortons';
    insert into public.taskflow_jobs (user_id, employer, area_id) values (u, 'Oland Stations', oland_tag)
      on conflict (user_id, employer) do nothing;
    select id into oland_job from public.taskflow_jobs where user_id = u and employer = 'Oland Stations';
    select sort into shift_sort from public.taskflow_actions where user_id = u and key = 'shift:' || coalesce(tim_job::text, '');
    if shift_sort is null then
      select coalesce(max(sort), -1) into shift_sort from public.taskflow_actions where user_id = u;
    end if;
    if not exists (select 1 from public.taskflow_actions where user_id = u and key = 'shift:' || oland_job::text) then
      update public.taskflow_actions set sort = sort + 1 where user_id = u and sort > shift_sort;
      insert into public.taskflow_actions (user_id, key, label, sort)
      values (u, 'shift:' || oland_job::text, 'Oland Stations shift', shift_sort + 1);
    end if;

    -- counters
    insert into public.taskflow_counters (user_id, name, emoji, color, sort) values
      (u, 'Cigarette', '🚬', '#6b7280', 0), (u, 'Weed', '🌿', '#22c55e', 1)
    on conflict (user_id, name) do nothing;

    -- verify: nothing lost
    select jsonb_build_object(
      'tasks', (select count(*) from public.taskflow_tasks where user_id = u),
      'presets', (select count(*) from public.taskflow_presets where user_id = u),
      'projects', (select count(*) from public.taskflow_projects where user_id = u),
      'sessions', (select count(*) from public.taskflow_sessions where user_id = u),
      'notes', (select count(*) from public.taskflow_notes where user_id = u),
      'jobs', (select count(*) from public.taskflow_jobs where user_id = u),
      'actions', (select count(*) from public.taskflow_actions where user_id = u),
      'areas', (select count(*) from public.taskflow_areas where user_id = u)) into n_after;
    if (n_after->'tasks') <> (n_before->'tasks') or (n_after->'presets') <> (n_before->'presets')
       or (n_after->'projects') <> (n_before->'projects') or (n_after->'sessions') <> (n_before->'sessions')
       or (n_after->'notes') <> (n_before->'notes')
       or (n_after->>'jobs')::int < (n_before->>'jobs')::int or (n_after->>'actions')::int < (n_before->>'actions')::int
       or (n_after->>'areas')::int < (n_before->>'areas')::int then
      raise exception 'TaskFlow migration check failed for user %: before % after % — rolled back, nothing changed.', u, n_before, n_after;
    end if;
    if exists (select 1 from public.taskflow_areas where user_id = u and kind in ('focus','wellbeing','leisure','social','life')) then
      raise exception 'TaskFlow migration left an old tag kind behind for user % — rolled back.', u;
    end if;
  end loop;

  alter table public.taskflow_areas
    add constraint taskflow_areas_kind_v2 check (kind in ('work','hustle','study','wellness','break','sleep','personal'));
  alter table public.taskflow_areas alter column kind set default 'personal';
end $$;

drop function if exists pg_temp.tf_retag(uuid, uuid, uuid);
drop function if exists pg_temp.tf_tag(uuid, uuid, text, text, text, text, int, text);
drop function if exists pg_temp.tf_place(uuid, text, uuid, text, text);
drop function if exists pg_temp.tf_parent(uuid, text, text, text, text, text, int);

-- Unique per parent, treating "no parent" as one value (two top-level tags can't share a name).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'taskflow_areas_parent_name_key') then
    alter table public.taskflow_areas
      add constraint taskflow_areas_parent_name_key unique nulls not distinct (user_id, parent_id, name);
  end if;
end $$;
create index if not exists taskflow_areas_parent on public.taskflow_areas (parent_id);

-- Tag tree rules: two levels at most; a sub-tag always has its parent's kind; a parent's kind change flows down.
create or replace function public.taskflow_areas_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
declare p public.taskflow_areas;
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then raise exception 'A tag cannot be its own parent'; end if;
    select * into p from public.taskflow_areas where id = new.parent_id;
    if not found then raise exception 'Parent tag not found'; end if;
    if p.parent_id is not null then raise exception 'Tags have at most two levels: a sub-tag cannot have sub-tags'; end if;
    if exists (select 1 from public.taskflow_areas where parent_id = new.id) then
      raise exception 'A tag that has sub-tags cannot become a sub-tag';
    end if;
    new.kind := p.kind;
  end if;
  return new;
end $$;

create or replace function public.taskflow_areas_cascade_kind() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  update public.taskflow_areas set kind = new.kind where parent_id = new.id and kind is distinct from new.kind;
  return null;
end $$;

drop trigger if exists taskflow_areas_guard on public.taskflow_areas;
create trigger taskflow_areas_guard before insert or update on public.taskflow_areas
  for each row execute function public.taskflow_areas_guard();
drop trigger if exists taskflow_areas_cascade_kind on public.taskflow_areas;
create trigger taskflow_areas_cascade_kind after update of kind on public.taskflow_areas
  for each row when (old.kind is distinct from new.kind and new.parent_id is null)
  execute function public.taskflow_areas_cascade_kind();

-- Merge one tag into another: everything that pointed at p_from points at p_into, then p_from is archived. One atomic call.
-- security invoker: row-level security applies, so it can only ever touch the caller's own rows.
create or replace function public.taskflow_merge_tag(p_from uuid, p_into uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare f public.taskflow_areas; t public.taskflow_areas;
begin
  if p_from = p_into then raise exception 'Cannot merge a tag into itself'; end if;
  select * into f from public.taskflow_areas where id = p_from;
  if not found then raise exception 'Tag to merge not found'; end if;
  select * into t from public.taskflow_areas where id = p_into;
  if not found then raise exception 'Tag to merge into not found'; end if;
  if t.archived then raise exception 'Cannot merge into an archived tag'; end if;
  if exists (select 1 from public.taskflow_areas where parent_id = p_from and not archived) then
    raise exception 'Move or archive its sub-tags first';
  end if;
  update public.taskflow_tasks    set area_id = p_into where area_id = p_from;
  update public.taskflow_presets  set area_id = p_into where area_id = p_from;
  update public.taskflow_sessions set area_id = p_into where area_id = p_from;
  update public.taskflow_notes    set area_id = p_into where area_id = p_from;
  update public.taskflow_projects set area_id = p_into where area_id = p_from;
  update public.taskflow_jobs     set area_id = p_into where area_id = p_from;
  update public.taskflow_areas    set archived = true  where id = p_from;
end $$;
revoke all on function public.taskflow_merge_tag(uuid, uuid) from public;
grant execute on function public.taskflow_merge_tag(uuid, uuid) to authenticated;

-- ───────────── Realtime for the new tables ─────────────
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['taskflow_counters','taskflow_counter_events'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Revision 4 (phase 2.7): counter short labels, activities (presets + weekly target), task tag shortlist.
-- Idempotent: safe to re-run. Nothing is dropped. Emoji columns stay in the database but the app no longer reads or writes them.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

alter table public.taskflow_counters add column if not exists short_label text;
update public.taskflow_counters set short_label = 'Cig'  where name = 'Cigarette' and short_label is null;
update public.taskflow_counters set short_label = 'Weed' where name = 'Weed'      and short_label is null;

alter table public.taskflow_presets add column if not exists weekly_target int;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'taskflow_presets_weekly_target_positive') then
    alter table public.taskflow_presets add constraint taskflow_presets_weekly_target_positive
      check (weekly_target is null or weekly_target > 0);
  end if;
end $$;

-- Task tag shortlist. The first run (the column does not exist yet) adds Hustle / Projects, flags the six task tags and adds the
-- Home Workout and Gym activities. Later runs skip all of it, so a tag you un-flag in Settings → Tags stays un-flagged.
do $$
declare
  u uuid; p_hustle uuid; p_wellness uuid; proj uuid; area uuid; pid uuid; next_sort int; act_sort int;
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'taskflow_areas' and column_name = 'show_for_tasks') then
    return;
  end if;

  alter table public.taskflow_areas add column show_for_tasks boolean not null default false;

  for u in select distinct user_id from public.taskflow_areas loop
    select id into p_hustle   from public.taskflow_areas where user_id = u and parent_id is null and name = 'Hustle';
    select id into p_wellness from public.taskflow_areas where user_id = u and parent_id is null and name = 'Wellness';

    if p_hustle is not null then
      select id into proj from public.taskflow_areas where user_id = u and parent_id = p_hustle and name = 'Projects';
      if proj is null then
        insert into public.taskflow_areas (user_id, name, parent_id, kind, color, sort)
        values (u, 'Projects', p_hustle, 'hustle', '#8b5cf6',
                (select coalesce(max(sort), -1) + 1 from public.taskflow_areas where user_id = u and parent_id = p_hustle));
      end if;
    end if;

    update public.taskflow_areas a set show_for_tasks = true
     where a.user_id = u and (
       (a.parent_id is null and a.name = 'Study')
       or (a.name in ('Oland Stations', 'Commute') and a.parent_id in (select id from public.taskflow_areas where user_id = u and parent_id is null and name = 'Work'))
       or (a.name in ('AEO Studio', 'Projects')    and a.parent_id = p_hustle)
       or (a.name = 'Trading'                      and a.parent_id in (select id from public.taskflow_areas where user_id = u and parent_id is null and name = 'Study')));

    -- activities: the four from SPEC §16 (existing presets keep their ids and minutes)
    if p_wellness is not null then
      select coalesce(max(sort), -1) + 1 into next_sort from public.taskflow_presets where user_id = u;
      for area in
        select a.id from public.taskflow_areas a
         where a.user_id = u and a.parent_id = p_wellness and a.name in ('Home Workout', 'Gym') order by a.sort
      loop
        pid := null;
        insert into public.taskflow_presets (user_id, name, area_id, default_minutes, sort)
        select u, a.name, a.id, case a.name when 'Gym' then 60 else 30 end, next_sort
          from public.taskflow_areas a where a.id = area
        on conflict (user_id, name) do nothing
        returning id into pid;
        if pid is not null then
          next_sort := next_sort + 1;
          -- the matching action button goes right before "Sleep check-in", like the first two activities have
          select sort into act_sort from public.taskflow_actions where user_id = u and key = 'sleep_checkin';
          if act_sort is null then
            select coalesce(max(sort), -1) + 1 into act_sort from public.taskflow_actions where user_id = u;
          else
            update public.taskflow_actions set sort = sort + 1 where user_id = u and sort >= act_sort;
          end if;
          insert into public.taskflow_actions (user_id, key, label, sort)
          select u, 'preset:' || pid::text, pr.name, act_sort from public.taskflow_presets pr where pr.id = pid
          on conflict (user_id, key) do nothing;
        end if;
      end loop;
    end if;
  end loop;
end $$;

-- Log one activity-button tap (or a back-dated one) as a stopped session with one segment, ending at p_ended_at.
-- The client supplies p_id, so a retry (flaky network, the offline queue replaying) returns the same id and never duplicates.
-- security invoker: row-level security applies, so it can only ever read or write the caller's own rows.
create or replace function public.taskflow_log_activity(p_id uuid, p_preset uuid, p_minutes int, p_ended_at timestamptz default now())
returns uuid
language plpgsql security invoker set search_path = public as $$
declare pr public.taskflow_presets; started timestamptz;
begin
  if p_id is null then raise exception 'An id is required'; end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 1440 then raise exception 'Minutes must be between 1 and 1440'; end if;
  if p_ended_at > now() + interval '1 minute' then raise exception 'That time is in the future'; end if;

  if exists (select 1 from public.taskflow_sessions where id = p_id) then return p_id; end if;   -- already logged: retry is a no-op

  select * into pr from public.taskflow_presets where id = p_preset;
  if not found then raise exception 'Activity not found'; end if;

  started := p_ended_at - make_interval(mins => p_minutes);
  insert into public.taskflow_sessions (id, area_id, source, preset_id, started_at, ended_at, state)
  values (p_id, pr.area_id, 'preset', pr.id, started, p_ended_at, 'stopped');
  insert into public.taskflow_session_segments (session_id, started_at, ended_at)
  values (p_id, started, p_ended_at);
  return p_id;
exception when unique_violation then
  return p_id;   -- two retries raced; the other one won
end $$;
revoke all on function public.taskflow_log_activity(uuid, uuid, int, timestamptz) from public;
grant execute on function public.taskflow_log_activity(uuid, uuid, int, timestamptz) to authenticated;

-- Realtime: activity logs appear on the other device
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'taskflow_presets') then
    alter publication supabase_realtime add table public.taskflow_presets;
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Phase 2.8: goals (versioned), counter reasons.
-- Idempotent: safe to re-run. Nothing is dropped.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- A goal row is one VERSION. Editing the target closes the old row (ends_on) and inserts a new one with the same series_id,
-- so past periods are judged against the target they had then.
create table if not exists public.taskflow_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  series_id   uuid not null default gen_random_uuid(),
  name        text not null default '',
  metric      text not null check (metric in ('tag_minutes','counter_count','activity_count','tasks_done')),
  target_id   uuid,                                   -- tag, counter or activity (null for tasks_done); no FK: it spans three tables and a goal outlives an archived target
  direction   text not null check (direction in ('at_least','at_most')),
  amount      int  not null check (amount > 0),       -- minutes for tag_minutes, otherwise a count
  period      text not null check (period in ('day','week','month')),
  starts_on   date not null,
  ends_on     date,
  paused      boolean not null default false,
  sort        int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  check ((metric = 'tasks_done') = (target_id is null))
);
create index if not exists taskflow_goals_user_series on public.taskflow_goals (user_id, series_id);

do $$
begin
  drop trigger if exists taskflow_set_updated_at on public.taskflow_goals;
  create trigger taskflow_set_updated_at before update on public.taskflow_goals
    for each row execute function public.taskflow_set_updated_at();
  alter table public.taskflow_goals enable row level security;
  drop policy if exists "own rows" on public.taskflow_goals;
  create policy "own rows" on public.taskflow_goals for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  grant select, insert, update, delete on public.taskflow_goals to authenticated;
end $$;

-- Counter reasons: an editable list per counter, and the reason picked after a tap (optional).
alter table public.taskflow_counters       add column if not exists reasons text[];
alter table public.taskflow_counter_events add column if not exists reason  text;
-- Defaults for the two seeded counters, once: only where the list was never set (null), so a list you empty later stays empty.
update public.taskflow_counters
   set reasons = array['after shift','bored','social','stress','after meal','with coffee']
 where reasons is null and name in ('Cigarette','Weed');

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'taskflow_goals') then
    alter publication supabase_realtime add table public.taskflow_goals;
  end if;
end $$;

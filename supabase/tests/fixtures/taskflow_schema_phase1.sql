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

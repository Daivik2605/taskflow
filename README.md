# TaskFlow

Tasks, timer, shifts and pay, nap + reset, calendar with days off, inbox and project briefs — one app of PersonalOS. Used on Mac and iPhone. Spec: `docs/SPEC.md`; phases: `docs/BUILD_PLAN.md`; rules for Claude Code: `CLAUDE.md`.

Status: **phase 3 (deployable PWA; see docs/DEPLOY.md)** — tags (a two-level tree), task dates (day / window / deadline), cigarette and weed counters, Insights, Today and Tasks views, realtime sync. Timer, calendar, inbox, projects and work are placeholders until their phases.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase **Project URL** and **anon** key (Project Settings → API). Anon key only — never the service_role key or the DB password.
3. **Create the tables:** open Supabase → SQL Editor → New query, paste the whole of `supabase/taskflow_schema.sql`, Run. Safe to run again at any time; it never drops data. Do this once now, and again whenever a later phase says the file changed.
4. `npm run dev` → http://localhost:5175 (port is fixed; if it's taken the server refuses to start rather than moving).
5. Sign in with your PersonalOS email and password. The first sign-in creates your 13 areas, the Sudarshan Kriya (35 min) and Padmasadhna (20 min) presets, the AEO Studio project, the Tim Hortons job, the pinned actions and your settings — once only.

To open it on the iPhone before the phase 3 deploy: run `npm run dev`, and visit `http://<your Mac's LAN IP>:5175` on the same Wi-Fi.

## Commands
| | |
|---|---|
| `npm run dev` | dev server on 5175 |
| `npm test` | unit and component tests (time, tasks, tags, counters, insights, seed, pay config, theme, shell, Today / Tasks / Insights, task sheet, counters, settings) |
| `npm run typecheck` | TypeScript |
| `npm run build` | production build into `dist/` |
| `npm run test:schema` | proves the schema on a throwaway local Postgres with Supabase stand-ins, never on Supabase: a **fresh install** (schema twice, RLS, isolation, indexes, triggers, tag rules, task dates, counter days across DST, merge, realtime) and the **phase-1 → revision-2 migration** (frozen phase-1 schema + seed + sample work + tags you made yourself → current schema three times → nothing deleted, ids kept, every task/preset/session/note on the right tag, tree equals the new-account seed). Needs Postgres 15+ from Homebrew (`PGBIN` to override). |

## Pay is not set up yet
The Tim Hortons job is seeded with **no hourly rate and no pay-period start date**. Wherever pay appears, the app says "Set your rate and pay period in Settings → Jobs" until both are set (phase 6).

## Layout
- `src/lib/` — pure, tested logic (`time.ts` = the only place days are computed, America/Toronto).
- `src/app/` — shell, navigation, auth, connection banner. `src/screens/` — one file per screen (thin).
- `supabase/taskflow_schema.sql` — the whole database for this app, extended (never rewritten) by later phases.

## Phase 2.5: run the SQL (existing Supabase project)
The app code for phase 2.5 needs the new tables and columns. Until you run this it shows a banner, "The database is out of date", instead of loading.

1. **Optional safety copy:** Supabase → Table Editor → `taskflow_areas` and `taskflow_tasks` → export as CSV. (The migration is all-or-nothing, never deletes, and writes a before-image of every row it changes to `taskflow_migration_log`, so this is belt and braces.)
2. Supabase → SQL Editor → New query → paste the **whole** of `supabase/taskflow_schema.sql` → Run. It needs Postgres 15 or newer (every current Supabase project is); on an older one it stops before changing anything. It's safe to run again — the migration part only runs once.
3. Then `npm run dev` and sign in.

**What the migration does to your data** (in place, same ids, so tasks, presets, projects and jobs keep their links): DSA, Trading, SQL → Study; Tableau cert and Databricks cert → Study / *Tableau Data Analyst Certification*, *Databricks Data Analyst Certification*; AEO Studio → Hustle; Work — Tim Hortons → Work / Tim Hortons; Wellbeing → Wellness; Life admin → Personal; Sleep stays. Projects, Leisure and People are archived and their tasks, presets, sessions and notes move to Personal, Break and Break. New: the parents Work, Hustle, Study, Break; the sub-tags Oland Stations, Commute, Kriya, Padmasadna, Home Workout, Gym; the presets *Sudarshan Kriya* and *Padmasadhna* become **Kriya** and **Padmasadna** under Wellness; a second job **Oland Stations** (no rate or pay period yet) and its shift button; the counters **Cigarette** and **Weed**. Tags you created yourself stay as top-level tags (their kind is mapped); if one has the same name as a new sub-tag it is reused and its tasks keep their link. Existing tasks get **no** start date.

**What to check afterwards** — paste into the SQL Editor (read-only):
```sql
-- the tag tree: parents first, each followed by its sub-tags
select coalesce(p.name, '—') as parent, a.name, a.kind, a.archived
from taskflow_areas a left join taskflow_areas p on p.id = a.parent_id
order by coalesce(p.sort, a.sort), (a.parent_id is not null), a.sort;

-- every task and the tag it now has
select t.title, t.due_on, t.start_on, t.hard_deadline,
       coalesce(p.name || ' › ' || a.name, a.name) as tag
from taskflow_tasks t
left join taskflow_areas a on a.id = t.area_id left join taskflow_areas p on p.id = a.parent_id
order by t.created_at;

select (select count(*) from taskflow_tasks) as tasks, (select count(*) from taskflow_presets) as presets,
       (select count(*) from taskflow_jobs) as jobs, (select count(*) from taskflow_counters) as counters,
       (select count(*) from taskflow_migration_log) as logged_rows;
```
You should see: seven parents (Work, Hustle, Study, Wellness, Break, Sleep, Personal) with their sub-tags; Projects, Leisure and People archived; the same number of tasks as before, none with an empty tag unless it had none; 2 jobs, 2 counters, `logged_rows` greater than 0. In the **Table Editor**: `taskflow_jobs` has *Tim Hortons* and *Oland Stations* with empty `hourly_rate` and `pay_period_anchor`; `taskflow_actions` has a *shift:* button for each job and the two presets renamed Kriya and Padmasadna. Then run `../supabase/checks.sql` — queries 1–8 should return nothing for `taskflow_` objects.

## Counters, tags and dates in one minute
- **Today** starts with the two counter buttons: tap = +1 now with a 5-second **Undo**; long-press (or the … button) adds a tap at a past time (Toronto time) or edits today's taps.
- **Settings → Tags** is the tree editor (add parent / sub-tag, rename, colour, emoji, reorder, move, archive, merge). **Settings → Counters** adds more counters. **Settings → Week starts on** sets what "this week" means.
- A task's **When**: *No date*, *On a day*, *Window* (This week · Next 7 days · Next 2 weeks · This month · custom) or *Deadline* (hard, optional "start working from"). A task with a due date and no start day (made before phase 2.5) is active now and shows "N days left".

## Phase 2.7: run the SQL (revision 4: simplify)
The app code for phase 2.7 needs three new columns and one function. Until you run this it shows the banner "The database is out of date".

1. Supabase → SQL Editor → New query → paste the **whole** of `supabase/taskflow_schema.sql` → Run. It only adds things, never deletes, and is safe to run again. (A second run does **not** re-flag a tag you un-ticked under "Offer on tasks".)
2. What it does, once: adds `taskflow_counters.short_label` (**Cig**, **Weed**), `taskflow_presets.weekly_target`, `taskflow_areas.show_for_tasks`; adds the sub-tag **Hustle / Projects**; ticks "Offer on tasks" for Oland Stations, Commute, AEO Studio, Projects, Study and Trading only; adds the activities **Home Workout** (30 min) and **Gym** (60 min) next to Kriya and Padmasadna (their ids and minutes are kept); adds the function `taskflow_log_activity` (security invoker, granted to `authenticated`) that the activity buttons call.
3. Then `npm run dev` and tap through every screen.

**What to check afterwards** (read-only, paste into the SQL Editor):
```sql
select name, short_label from taskflow_counters order by sort;                       -- Cigarette Cig · Weed Weed
select name, default_minutes, weekly_target from taskflow_presets order by sort;     -- Kriya 35 · Padmasadna 20 · Home Workout 30 · Gym 60
select coalesce(p.name || ' › ' || a.name, a.name) as tag from taskflow_areas a
  left join taskflow_areas p on p.id = a.parent_id where a.show_for_tasks order by 1;  -- exactly six rows
select proname, prosecdef from pg_proc where proname = 'taskflow_log_activity';      -- prosecdef = false (security invoker)
```

## Phase 2.8: run the SQL (goals, limits, reasons)
The app code for phase 2.8 needs one new table and two new columns. Until you run this it shows the banner "The database is out of date".

1. Supabase → SQL Editor → New query → paste the **whole** of `supabase/taskflow_schema.sql` → Run. It only adds things, never deletes, and is safe to run again.
2. What it does, once: creates `taskflow_goals` (a row per version of a goal), adds `taskflow_counters.reasons` and `taskflow_counter_events.reason`, and gives Cigarette and Weed the default reasons (after shift · bored · social · stress · after meal · with coffee) only if they have none yet. A reasons list you empty later stays empty.
3. Then `npm run dev`: Settings → Goals → add "Cigarette at most 5 per day" and "Gym at least 3 times per week".

**What to check afterwards** (read-only):
```sql
select count(*) from taskflow_goals;                                                  -- 0 until you add goals
select name, reasons from taskflow_counters order by sort;                            -- Cigarette and Weed: the six reasons
select column_name from information_schema.columns where table_name = 'taskflow_counter_events' and column_name = 'reason';  -- one row
```

## Phase 3: deployed + installable (PWA)
Production: `https://taskflow.jarvisjr.daivik.dev` (Vercel project `taskflow`; DNS at Hostinger). The click-by-click steps, the DNS record, the Supabase settings (redirect URL, sign-ups off), installing on iPhone and Mac, and the check list are in **`docs/DEPLOY.md`**. Env vars on Vercel: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (anon key only; redeploy after changing). No SQL to run in this phase.


## Phase 3.7: run the SQL (activity setting, hide unfinished screens)
Two new columns; until you run this the app shows "The database is out of date".

1. Supabase → SQL Editor → New query → paste the **whole** of `supabase/taskflow_schema.sql` → Run (adds only, safe to re-run).
2. It adds `taskflow_presets.allow_multiple` (default false) and `taskflow_settings.hide_unfinished_screens` (default true).

**What to check afterwards** (read-only):
```sql
select name, allow_multiple from taskflow_presets order by sort;      -- all false
select hide_unfinished_screens from taskflow_settings;               -- true
```

# TaskFlow — spec

TaskFlow is the general-purpose layer of PersonalOS: tasks with deadlines, a timer for any activity, Tim Hortons shifts and pay, nap + reset, a calendar with days off for the whole OS, sleep, a quick-capture inbox, and project briefs. Used on **MacBook and iPhone**. Where each area of my life lives: `../../docs/ROADMAP.md`. System rules: `../../CLAUDE.md`. Dashboard contract: `../../docs/CONTRACT.md`.

Sections are numbered so the build plan can point at them (e.g. "SPEC §6").

**What TaskFlow must answer** (every feature serves one of these): 1. what I did each day · 2. how much time each task took · 3. hours at work · 4. hours studying · 5. how many tasks were missed · 6. how many deadlines were missed — plus cigarette and weed counts, activities done, and goals hit.

**Revision 4 (simplify):** no emojis anywhere in the UI (text labels and colour dots only; the `emoji` columns stay in the database unused); counters are small pills in the top-left of every screen (§13); repeat activities are one-tap buttons, not tasks (§16); the task tag picker shows a short list (§2b); past shifts can be logged in one form (§6.1).

**Everything is editable:** any activity button, goal, tag, counter, reminder, job rule or schedule can be changed, paused or turned off from Settings or from the item itself, and changes apply from today forward without rewriting history.

**Words used in this spec (revision 2, 2026-10-24):** a **tag** is one node of my two-level tag tree (parent → sub-tag, §2b). In the database the table stays `taskflow_areas` and the column `area_id` (no rename, to keep phase 1–2 code and data), but the UI always says **Tag**. Wherever this spec still says "area", read "tag". The free-text `tags text[]` column on tasks is shown in the UI as **Labels** (e.g. `agent`, `urgent`) and never drives time totals.

---

## 1. Stack and app rules
- Vite + React + TypeScript + Tailwind, React Router, Vitest + Testing Library — same as InteractiveDSA. supabase-js with the anon key from `.env.local`.
- Dev port **5175** (`server` and `preview`: `{ port: 5175, strictPort: true }`). Prefix `taskflow_` for every table, view, function and trigger; buckets `taskflow-…`.
- **Also deployed online** (Vercel or Netlify, free static hosting) and installable as a **PWA** (`vite-plugin-pwa`) on the iPhone home screen and the Mac dock — the only PersonalOS app that is. The phone must work from anywhere.
- **Online-first:** writes go straight to Supabase with optimistic UI and a visible error + retry on failure. **Realtime** subscriptions on the tables that change on another device (tasks, sessions, segments, resets, shifts, breaks, notes) so the Mac and phone stay in sync within seconds.
- **Time:** every "day" is the America/Toronto calendar date (`YYYY-MM-DD`, Postgres `date`); every moment is `timestamptz`. All day logic goes through one tested module `src/lib/time.ts` (today, day of a moment, split an interval across days, format durations as `1h 05m`). Never use the browser's local date directly.
- **Business logic in pure, unit-tested modules** under `src/lib/` (`time.ts`, `tasks.ts`, `timer.ts`, `pay.ts`, `reset.ts`, `streak.ts`); components stay thin.
- Mobile-first: works at 375px; bottom tab bar on phone, sidebar on ≥ 1024px. Dark mode (follows system, override in Settings). Big tap targets for the action buttons.
- Same Supabase email/password account as the other apps. Session persists; sign-in screen only when signed out.
- If Supabase can't be reached: show a banner, keep showing loaded data, and disable writes rather than losing them.

## 2. Data (all in `supabase/taskflow_schema.sql`)
Root DB rules apply to every table: `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`, RLS on, `"own rows"` policy for `authenticated`, `id uuid primary key default gen_random_uuid()`, `created_at`/`updated_at timestamptz default now()` with an `updated_at` trigger. The file is idempotent, never drops data, adds every changing table to the `supabase_realtime` publication (guarded so re-runs don't fail), and is extended — never rewritten — by later phases.

| Table | Key columns |
|---|---|
| `taskflow_areas` (UI: **tags**) | name, `parent_id`? (null = parent tag; max two levels), `kind` (`work` · `hustle` · `study` · `wellness` · `break` · `sleep` · `personal`; a sub-tag always has its parent's kind), `app_key` (nullable: `dsa`, `trading`, …), color, sort, archived. Unique `(user_id, parent_id, name)` |
| `taskflow_projects` | name, area_id, summary, why, location, status (`idea` · `active` · `paused` · `done` · `dropped`), whats_left, next_step, started_on, last_touched_at |
| `taskflow_tasks` | title, description, area_id (tag, optional), `start_on` date?, `due_on` date?, `hard_deadline` bool (default false), `estimate_minutes`?, project_id?, parent_id? (sub-tasks), `due_on` date?, priority 1–3 (default 2), status (`todo` · `doing` · `done` · `dropped`), owner (default `me`; free text e.g. `Anikait`, `external`), waiting_on, tags text[], completed_at, sort, from_note_id? |
| `taskflow_sessions` | area_id, task_id?, `source` (`timer` · `manual` · `preset`), preset_id?, comment, started_at, ended_at?, `state` (`running` · `paused` · `stopped`). Partial unique index: one non-stopped session per user |
| `taskflow_session_segments` | session_id, started_at, ended_at? |
| `taskflow_presets` | name, area_id, default_minutes, sort, archived |
| `taskflow_actions` | `key` (`shift:<job_id>`, `nap_reset`, `preset:<id>`, `sleep_checkin`), label, pinned, sort, hidden |
| `taskflow_resets` | started_at, nap_ended_at?, ended_at?, `ended_by` (`manual` · `taskflow_timer` · `shift_punch_in` · `app` · `auto_check`), ended_by_app?, ended_by_detail?, had_nap bool, edited bool. Partial unique index: one open reset per user |
| `taskflow_jobs` | employer, area_id, hourly_rate numeric, pay_period_days (14), pay_period_anchor date, rule columns (§6.2) |
| `taskflow_shifts` | job_id, `day`, scheduled_start?, scheduled_end?, clock_in_at, clock_out_at?, `state` (`on_shift` · `on_break` · `done`), store_clock_in_at?, store_clock_out_at?, store_break_minutes?, `break_status` (`taken` · `skipped` · `left_on_break`), manager_said_no_deduction bool, verified bool, notes |
| `taskflow_shift_breaks` | shift_id, started_at?, ended_at?, `source` (`live` · `manual`), minutes? (manual entry without times) |
| `taskflow_paystubs` | job_id, period_start, period_end, pay_date, paid_regular_minutes, paid_overtime_minutes, gross_pay, net_pay, notes, file_path? |
| `taskflow_notes` | `kind` (`idea` · `research` · `remember` · `link`), title, body (markdown), url?, area_id?, project_id?, task_id?, pinned, archived |
| `taskflow_days_off` | `day` (unique per user), `kind` (`holiday` · `vacation` · `sick` · `rest`), label |
| `taskflow_sleep` | `day` (wake-up day, unique per user), bed_at, wake_at, minutes (generated), quality 1–5? |
| `taskflow_counters` | name, emoji, color, sort, archived. Unique `(user_id, name)` |
| `taskflow_counter_events` | counter_id, `at` timestamptz, `day` date (Toronto, set via `time.ts`), qty int (default 1), note? |
| `taskflow_settings` | one row per user: theme, reset_check_hours (4), cold_project_days (30), taskflow_url, week_starts_on (1 = Monday) |

Triggers: a write to a task, session or note that has a project bumps `taskflow_projects.last_touched_at`. Indexes on `(user_id, due_on)`, `(user_id, started_at)`, `(user_id, day)`.

Buckets (private, files under `<user_id>/…`): `taskflow-paystubs`, `taskflow-timecards`.

**Seeding** (in app code on first sign-in, like chart-journal's watchlist): the tag tree from §2b, presets *Kriya 35 min* and *Padmasadna 20 min*, the AEO Studio project (tag Hustle/AEO Studio), the **Tim Hortons** and **Oland Stations** jobs (rate and pay period null until set; rules from §6.2 defaults), the counters **Cigarette 🚬** and **Weed 🌿**, the default actions, and the settings row. Existing accounts are migrated, not re-seeded (see BUILD_PLAN phase 2.5).

## 2b. Tags (revision 2 — replaces the flat area list)
Every timed thing (timer session, preset log, shift, commute, nap, reset) has **exactly one tag**, so every minute is counted once and totals always add up (the same reason Toggl uses one project per time entry and treats multi-tags as filters). A task has **one optional tag**; when a timer starts from a task it takes the task's tag. Picking a parent tag is allowed (time goes to the parent's "(general)" bucket).

Seeded tree (editable in **Settings → Tags**: add parent / add sub-tag, rename, color, emoji, reorder, move a sub-tag to another parent, archive, **merge** = move all tasks/sessions/presets to another tag then archive):

| Parent (kind) | Sub-tags |
|---|---|
| **Work** (`work`) | Tim Hortons · Oland Stations · Commute |
| **Hustle** (`hustle`) | AEO Studio |
| **Study** (`study`) | DSA (`app_key dsa`) · SQL · Trading (`app_key trading`) · Tableau Data Analyst Certification · Databricks Data Analyst Certification |
| **Wellness** (`wellness`) | Kriya · Padmasadna · Home Workout · Gym |
| **Break** (`break`) | — |
| **Sleep** (`sleep`) | — |
| **Personal** (`personal`) | — (for life tasks like "Pass G2"; delete it if unwanted) |

- **Commute** = time from leaving work until I'm home (and to work, if I want). Counted as work-related time, never as paid time.
- **Productive hours** (dashboard goal) = `study` + `hustle`. **Hours at work** = `work` (paid shift time and commute shown separately). Wellness, break and sleep are balance.
- Naps → Sleep; resets → Break. Presets: Kriya 35 min → Wellness/Kriya, Padmasadna 20 min → Wellness/Padmasadna.
- Tag picker: grouped list (parents with sub-tags indented), recent tags first, colour dot (no emoji).
- **Task tag shortlist (revision 4):** each tag has `show_for_tasks` (Settings → Tags). The **task** sheet and quick add only offer those, defaulting to: **Oland Stations · Commute · AEO Studio · Projects · Study · Trading** — plus "No tag" (e.g. "Pass G2"). The timer, activities and Insights still use the full tree. A new sub-tag **Hustle / Projects** is added for project work.

## 3. Tasks and Today
- **Task sheet:** title, description, due date, area, project, priority, owner, waiting on, tags, sub-tasks (checklist of child tasks). Quick add = title + optional due date, defaults to area *Life admin* (changeable).
- **Dates (revision 2)** — following Things 3 / OmniFocus (a *start* date controls when a task shows up; a *deadline* is the finish line, used only for real external deadlines). The task sheet has one **When** control with four choices:
  | Choice | Stored as | Example |
  |---|---|---|
  | **No date** | nothing | "Research vector DBs" |
  | **On a day** | `start_on = due_on = day` | "Call bank — Tue" |
  | **Window** (This week · Next 7 days · Next 2 weeks · This month · Custom range) | `start_on`, `due_on` | "Finish Week 3 DSA — next 2 weeks" |
  | **Deadline** (hard, external) | `due_on`, `hard_deadline = true`, optional `start_on` = "start working from" | "Pass G2 — 9 Nov" |
  Week windows use `week_starts_on`. A task is **upcoming** before `start_on` (hidden from Today), **active** from `start_on` (or always, if none) until done.
- **Missed is computed, never stored** (pure functions in `tasks.ts`):
  - **Task missed** = not hard deadline, has `due_on`, `due_on` < today and not done/dropped (the day or window ended).
  - **Deadline missed** = `hard_deadline` and `due_on` < today and not done/dropped.
  - Finished after `due_on` = **done late**: still counted as missed (task or deadline) in history, shown with a "late" badge.
- **Chips on a task row:** `Today` · `Window · 3 days left` · `⚑ Deadline in 16 days` (amber ≤ 7 days, red ≤ 2 days or past) · `Missed` / `Late` · logged time `1h 20m` (/ estimate `2h` if set).
- **Time per task:** a ▶ button on every task row starts the timer on that task (with its tag); the task shows total logged time and estimate vs actual.
- **Counters:** done · missed · deadlines missed · left — for today, this week, this month, all time (left = active open tasks).
- **Tasks screen:** views **Today · Upcoming · Deadlines · Anytime · Done**, filters (tag — a parent includes its sub-tags, project, owner, status, label), grouped by due date; swipe or button to complete; drag/button reorder within a group.
- **Overview strip** (top of Today, revision 3): tappable cards, each opening the matching filtered view, with a **Today · Week · Month** toggle:
  - **To do** — active open tasks (today + in a window + no date)
  - **Due today** — due or planned for today
  - **Upcoming** — not started yet (future `start_on`)
  - **Deadlines** — hard deadlines in the next 14 days, with the nearest one named ("G2 in 16 days")
  - **Missed** — open missed tasks + deadlines missed (two numbers)
  - **Completed** — done in the period (late ones counted too)
  - **🚬 / 🌿** — count in the period, with the change vs the previous period (▲ 3 / ▼ 2)
  - **Time** (from phase 4) — hours studying, hustle, at work in the period
  Phone: a 2-column grid of compact cards; desktop: one row. Numbers come from the same pure functions as Insights, so the two never disagree.
  Built details: Due today, Upcoming and Deadlines are "now" snapshots (marked **now**, they ignore the toggle); To do / Missed / Completed / counters follow it. **To do** = active, not missed, due in the period, plus undated. **Deadlines** counts the next 14 days but names the nearest open one even beyond that. Counter change compares like for like (week so far vs the same days last week; today vs yesterday). One card per active counter. Cards open: Due today → `/tasks?view=today`, Upcoming/Deadlines → their Tasks views, To do → `/tasks`, Missed/Completed → `/insights?tab=range&range=<day|week|month>`, a counter → `/insights?tab=counters&counter=<id>`.
- **Today screen:** overview strip, smoke counter buttons (§13), pinned action buttons (§5), running timer bar, sleep check-in card (§8) if not logged, tasks: missed (to reschedule or drop) · deadlines coming up · today · in a window · no date, counters, quick-capture button (§9), "going cold" projects (§10).
- Test example: *Pass G2 — due 2026-11-09 — Life admin.*

## 4. Timer
- Start / Pause / Resume / Stop; area required, task optional; comment editable while running and at stop.
- Start = new session + first segment. Pause closes the open segment; Resume opens a new one; Stop closes it and sets `state = stopped`. Elapsed = sum of segments (+ now for an open one), computed from DB timestamps, so it survives closing the app and switching devices.
- One running/paused session at a time. Starting a new one asks to stop the current one.
- **Quick-log presets:** one tap creates a stopped session of `default_minutes` ending now (editable after).
- **Add past session:** area, task?, start, duration or end, comment (e.g. "Called Mom, 40 min").
- Today's sessions list with edit/delete; totals today and this week per area and per kind.
- A running timer bar appears on every screen.

## 5. Action tasks
Pinned buttons on Today that run a flow instead of being ticked. Flows are **coded** in a small registry (`src/actions/registry.ts`: `{ keyPrefix, label, icon, Component }`); the user can only pin, rename, reorder or hide them (Settings → Actions). v1: one per job (**Tim Hortons shift**, §6), **Nap + reset** (§7), one per preset, **Sleep check-in** (§8). The button shows live state (e.g. "On break · 12m").

## 6. Work — shifts and pay
### 6.1 Flow (the Tim Hortons action button)
- No open shift → `Punch in` (now) · `Add punch-in time`.
- On shift → `Start break` · `Add break minutes` · `Punch out` · `Add punch-out time`.
- On break → `End break` · `I left on break`.
- After punch out → summary: on the clock, break, paid time, estimated pay, and which rules applied.
- Punch in also ends any open reset (§7, `ended_by = shift_punch_in`).
- **Add a past shift** (one form, from the shift button's "…" and from Work → Shifts): job, date, start time, end time (an end earlier than the start means it ended the next day), break minutes (or "no break"), optional notes and store record → shows paid time and pay with the working before saving. Example: Tim Hortons, today, 03:00 → 10:00, 30 min break → 6h 25m paid if clock-in rounding doesn't apply (an exact 03:00 stays 03:00). Same rules as a live shift.
- **Commute:** after punch out the button offers `Heading home` → starts a timer session on **Work / Commute** (linked to that shift); `I'm home` stops it. Also available before a shift (`Heading to work`, stopped by punch-in). Commute is never paid time.
- One action button per job (Tim Hortons, Oland Stations); each job has its own rules.
- Shift history list; any shift editable (times, breaks, notes).

### 6.2 Pay rules (per-job columns, edited in Settings → Jobs; pure functions in `pay.ts`)
Defaults until the real rules are confirmed:
| Column | Default | Meaning |
|---|---|---|
| `clock_in_round_minutes` / `clock_in_round_mode` | 5 / `up` | 15:02 → paid from 15:05 |
| `clock_out_round_minutes` / `clock_out_round_mode` | 0 / `none` | |
| `early_clock_in_paid` | false | before the scheduled start, pay starts at the scheduled start |
| `break_paid` | false | |
| `break_expected_minutes` | 30 | |
| `break_required_after_minutes` | 300 | Ontario: 30 min eating period after 5 h |
| `overtime_after_weekly_minutes` / `overtime_multiplier` | 2640 / 1.5 | Ontario 44 h |
- Paid minutes = rounded end − rounded start − (unpaid break minutes). Flags: short/no break owed (minutes not taken). Weekly overtime split. Every result carries a human "working" list.

### 6.3 My record vs the store's record
- `I left on break`: shift ends at the break start; break 0; `break_status = left_on_break`; message: *"Tracked: break 0 min, paid until 19:40. The store may show the break running until your manager closed it."*
- `Manager said it won't be deducted` toggle → shift stays **unverified**.
- **Store record** entry on any shift (store clock in/out, store break minutes) → shows my paid minutes vs store paid minutes and the difference in minutes and dollars (*"Store recorded a 47-min break; you tracked 0 → 47 min ≈ $13.40"*); entering it sets `verified = true`.

### 6.4 Pay periods and paystubs
- Periods from `pay_period_anchor` + `pay_period_days`. Each period: its shifts, my paid regular/overtime minutes, expected gross; unverified shifts listed first.
- Paystub entry (numbers + optional photo/PDF in `taskflow-paystubs`) → side-by-side with expected; green within a tolerance of ±15 min / ±$5 (settings), red otherwise.

### 6.5 Photo reading (time card / paystub)
- Upload to `taskflow-timecards` / `taskflow-paystubs`. Supabase **Edge Function `taskflow-read-image`** (Deno) checks the caller's JWT, downloads that user's file, sends it to the Claude API (vision; key in Supabase secrets `ANTHROPIC_API_KEY` — never in the app or repo) asking for strict JSON (punches per day, or paystub totals), validates it, and returns it. The app shows a pre-filled form; **nothing is saved until confirmed**. Clear error if the function isn't deployed.

Work minutes have kind `work`: shown as work hours and pay, never productive hours.

## 7. Nap + reset
- `Start nap + reset` → nap running. `Nap done` → nap ends, **reset keeps running**. `Start reset` skips the nap.
- Ends automatically when I start work: a timer under a `study`, `hustle` or `work` tag, a shift punch-in, or another app calling `taskflow_end_reset` (`../../docs/CONTRACT.md` → Shared calls; `../../docs/prompts/07-reset-hook.md`). Or `Reset done`.
- Starting work without `Nap done` ends nap and reset together. Times editable afterwards (`edited = true`).
- **Popup** wherever it ended: *"Reset ended at 4:12 pm — nap 1h 05m, reset 42m. Recorded."* with **Undo** (re-open) and **Edit**. In TaskFlow also shown when the reset was ended from another app while TaskFlow is open (realtime), as a toast.
- After `reset_check_hours`, TaskFlow asks "Still resetting?" (keep going / it ended at…). Never auto-closed silently.
- **Function** `taskflow_end_reset(p_app text, p_detail text, p_at timestamptz default now())` → json, `security invoker`, granted to `authenticated`: closes the caller's open reset that started before `p_at` (and the nap if open) at `p_at`, returns `{ended: true, nap_minutes, reset_minutes, started_at}`, else `{ended: false}`. Idempotent. TaskFlow's own triggers call the same logic.
- Nap minutes = kind `sleep` (shown as naps, separate from night sleep); reset minutes = kind `wellbeing`.

## 8. Calendar, days off, sleep
- **Calendar:** month and week views. Per day: tasks due, days off, shifts, productive (study + hustle) minutes as a shade, naps/resets. Week view shows sessions and shifts as blocks. Tap a day → its tasks, sessions, shifts, notes, sleep; mark the day off (`holiday` / `vacation` / `sick` / `rest` + label) or clear it.
- **Days off are for all of PersonalOS:** they neither break nor extend streaks; the dashboard reads them (§11).
- **Sleep check-in:** morning card: bedtime and wake time (pre-filled from the previous night), quality 1–5 optional; stored on the wake-up day. Sleep history in the calendar day view and a 14-day sleep chart.

## 9. Inbox (quick capture)
- One text box reachable from every screen (floating button) and from the PWA's home-screen shortcut (`/capture`); kind defaults to `idea`; Enter saves.
- List by kind, search (title + body), pin, archive, attach to area/project/task, **convert to task** (keeps `from_note_id`), markdown body, links open in a new tab.

## 10. Projects
- Cards: name, status, area, last touched, open task count, time spent. "Going cold" = active and untouched for `cold_project_days`.
- Project page = the brief (summary, why, location, what's left, next step when I come back) + tasks grouped by **owner** (me / Anikait / external) with a **waiting on** filter + notes + time spent.
- **Agents board** (any project): tasks tagged `agent` shown as columns *idea → building → built → live* (stored as an extra tag `agent:<stage>`; moving a card updates the tag; `live` also marks the task done).

## 11. Dashboard contract (`docs/DATA_CONTRACT.md`, per `../../docs/CONTRACT.md`)
Sessions, shifts, naps and resets that cross midnight are split across Toronto days.
- **`taskflow_dashboard_daily`** standard columns: `active_minutes` = minutes under `study` + `hustle` tags; `items_done` = tasks completed that day; `items_planned` = tasks due that day (historically correct — note it); `streak_current` = consecutive days with ≥ 1 productive minute, days off neither break nor extend; `headline` e.g. `2h 10m study · 3 done · 1 missed · 7h 25m work`. Extras: `work_minutes` (paid, my record), `commute_minutes`, `work_unverified_shifts`, `study_minutes`, `hustle_minutes`, `wellness_minutes`, `break_minutes`, `nap_minutes`, `reset_minutes`, `sleep_minutes`, `personal_minutes`, `tasks_missed`, `deadlines_missed`, `cigarettes`, `weed`, `is_day_off`, `activities_done`, `goals_hit`, `goals_total`, `mood`, `energy`.
- **`taskflow_dashboard_now`**: `status_line` e.g. `4 left today · 2 overdue · ⏱ DSA 25m`; `needs_attention` = overdue tasks + unverified shifts older than 14 days; `attention_label` = `overdue tasks / unchecked shifts`. Extras: `open_tasks`, `overdue_tasks`, `inbox_count`, `running_area`, `running_since`, `reset_running_since`, `on_shift_since`, `cold_projects`.
- **`taskflow_dashboard_area_daily`** (user_id, day, parent_tag, tag, tag_path, kind, app_key, minutes) — for the per-area chart and the max-rule against app-measured minutes. Exact meaning (Home relies on it): `parent_tag` = the parent tag's name (`Study`); `tag` = the sub-tag's name (`DSA`), or the parent's own name when time was logged on the parent itself (`Break`) — never null; `tag_path` = `Study/DSA` or `Break` (the same string the `/timer?tag=` deep link takes); `minutes` int; one row per user/day/tag. `app_key` is **unique per user among non-archived tags** (partial unique index on `taskflow_areas`), so each app links to at most one tag.
- **`taskflow_dashboard_days_off`** (user_id, day, kind, label).
- **`taskflow_dashboard_paystubs`** (user_id, job_id, employer, period_start, period_end, pay_date, gross_pay_cents, net_pay_cents, paid_minutes) — one row per paystub entered; read by the Money app to match payroll deposits (`../../money/docs/SPEC.md` §7). Added in phase 7.
- **`taskflow_dashboard_goals`** (user_id, goal_id, name, metric, target_label, direction, amount, period, period_start, period_end, progress, hit boolean, paused) — one row per goal per period, the current period plus the last 12, judged against the goal version in force then (§17). PersonalOS Home shows goals from here and never stores its own.
- **`taskflow_dashboard_deadlines`** (user_id, task_id, title, tag, due_on, days_left, hard_deadline) — open tasks with `hard_deadline` due in the next 60 days (cert exam dates, "Pass G2"); feeds the countdowns on PersonalOS Home. Requested by `../../dashboard/docs/SPEC.md` §2.3.
- **Deep links** PersonalOS Home opens (keep these routes stable; document them in `docs/DATA_CONTRACT.md`): `/timer?tag=<parent/sub-tag path>` (opens the timer with that tag picked, doesn't auto-start), `/tasks?view=today`, `/insights`, `/work`, `/capture`, `/review` (weekly review), `/goals`.
- All views `security_invoker`, granted to `authenticated`, append-only after release.

## 13. Counters (cigarettes, weed — replaces the planned Smoke app; revision 4: header pills)
- **Small counter pills in the top-left corner of every screen** (header, phone and desktop): `Cig 3` · `Weed 1` (each counter has a `short_label`, editable in Settings → Counters; empty falls back to the full name) (today's count; amber/red against a limit once goals exist). One tap = +1 now with a 5-second **Undo** toast. Long-press (or a small chevron) = add at a past time, or open today's taps to edit/delete, and "last: 2h 10m ago". No big buttons on Today.
- **No time tracking, no cost** — counts only. Generic so more counters can be added in Settings → Counters.
- **Stats** (Insights → Counters, and a tap on a counter): today, this week, this month, all time; per-day bars (last 30 days), per-week (last 12), per-month (last 12); 7- and 30-day daily average; days since last; zero days this month.
- Realtime, so a tap on the phone shows on the Mac.

## 14. Insights and daily log
- **Daily log** (Insights → Day, and from any calendar day): a timeline of what I did that day — timer sessions, shifts, commute, naps/resets, presets, tasks completed, counter taps — with totals by parent tag. ‹ › to move between days. This is goal 1.
- **Insights → Range** (day · week · month · custom): hours by parent tag and sub-tag (stacked bar per day + table), **hours at work** (paid shift, commute), **hours studying** (per study sub-tag), top tasks by time, estimate vs actual, tasks done / **tasks missed** / **deadlines missed** (with the list), counters.
- Built in pieces: tasks + counters sections in phase 2.5, time sections in phase 4, work sections in phase 6.

## 16. Activity buttons (revision 4 — replaces scheduled routines)
Things I do repeatedly and would never add as a task first (Kriya, Padmasadna, Home Workout, Gym, …) are **buttons**, not tasks.
- An **Activity** = name, tag (e.g. Wellness / Gym), default minutes, optional weekly target ("3 per week"), sort, archived. Edited in **Settings → Activities** (add, rename, change tag/minutes/target, reorder, hide). Seeded: Kriya 35 min, Padmasadna 20 min, Home Workout 30 min, Gym 60 min (all Wellness sub-tags); targets empty until I set them.
- **Activity buttons** sit on Today under the overview (a tap calls `taskflow_log_activity`, which takes a client-supplied id so a retry or an offline replay can never log twice): one tap = done now → a stopped timer session on its tag, `default_minutes` long, ending now (`source = 'preset'`, so the time counts in Insights). Undo toast. The button shows done today (check) and "2 this week" (or "2/3 this week" with a target).
- **Long-press / "…"**: log with different minutes, log at an earlier time or another day, see and delete this week's logs. (After phase 4: also "start timer instead".)
- No schedules, nothing generated, nothing ever "missed". If I skip Gym, nothing happens.
- Activities **are** the presets from §4 (same table `taskflow_presets`, gaining `weekly_target`): there is one list, not two.
- Weekly targets feed goals (§17) and the weekly review.

Scheduled recurring tasks (daily / weekdays / every N days, with misses) are **dropped from v1**; they can come back later if needed (§15).

## 17. Goals and targets (revision 3)
- A **goal** = metric + direction + amount + period, all editable, pausable, deletable:
  - **Time on a tag** (a parent includes its sub-tags): "Study ≥ 15 h / week", "Hustle ≥ 1 h / day"
  - **Counter**: "Cigarettes ≤ 5 / day", "Weed ≤ 2 / day", "≤ 20 / week"
  - **Activity**: "Gym ≥ 3 × / week", "Kriya ≥ 6 × / week" (counts activity-button logs)
  - **Tasks**: "≥ 3 tasks done / day"
- **History stays true:** editing a goal ends the old version (`ends_on`) and starts a new one (`starts_on`), so past weeks are judged against the target they had then.
- Shown as progress bars on the overview (§3), in Insights (hit rate per goal, streak of periods hit) and in the weekly review (§18). Days off (§8) are excluded from daily goals.
- **Smoking extras:** counter buttons show today's count against the limit (turns amber at the limit, red over), a live **time since last**, today's **longest gap** and the best gap this week. After a tap, an optional one-tap **reason** chip row (editable list per counter, defaults: after shift · bored · social · stress · after meal · with coffee); never required. Insights → Counters shows reasons by count and by time of day.

Tables: `taskflow_goals` (name, metric `tag_minutes` · `counter_count` · `activity_count` · `tasks_done`, target_id, direction `at_least` · `at_most`, amount, period `day` · `week` · `month`, starts_on, ends_on?, paused, sort); `taskflow_counters` gains `reasons text[]`; `taskflow_counter_events` gains `reason`.

## 18. Plan the day, shut down the day, weekly review (revision 3)
- **Morning plan** (card on Today until done or dismissed): today's tasks and deadlines; pick **Top 3**; quick-add anything missing; optional energy 1–5.
- **Evening shutdown** (card from a set time, default 21:00, or any time): what got done (time by tag, tasks, counters, goals hit), then each open task for today → **tomorrow · pick a day · back to no date · drop**; activities done today (tap any that were missed); **mood 1–5, energy 1–5**, one-line note. Takes ~1 minute.
- **Weekly review** (Sunday, default; any day possible): last week vs the week before — hours by tag, **planned vs actual** (goal targets vs real), goals hit, tasks done / missed / deadlines missed, activities per week vs targets, cigarettes and weed, average mood/energy/sleep; deadlines in the next 14 days; then set or adjust next week's goals and write a note. Past reviews are browsable.
- Tables: `taskflow_days` (day unique, top3 uuid[], plan_note, planned_at, mood, energy, review_note, reviewed_at); `taskflow_weeks` (week_start unique, note, reviewed_at, ai_summary?).

## 19. Logging without opening the app (iPhone Shortcuts, Back Tap, Siri) (revision 3)
- Supabase Edge Function **`taskflow-api`**, authenticated by a **personal API token** (Settings → Shortcuts: create, name, copy once, revoke; stored hashed in `taskflow_api_tokens` with last_used_at). The function looks up the token's user and acts **only on that user's rows**; it uses the service-role key that Supabase provides to Edge Functions server-side — never in the app or repo.
- Endpoints (POST, JSON, short spoken-friendly replies like "Cigarette 4 today"): `counter` {name} · `capture` {text} · `timer/start` {preset | tag | task} · `timer/stop` {comment?} · `activity/log` {name, minutes?}; later phases add `nap/start`, `nap/done`, `reset/done` (phase 5), `shift/punch-in`, `shift/break`, `shift/punch-out`, `commute/start`, `commute/stop` (phase 6).
- The phase writes step-by-step instructions for: a Shortcut per action; **Back Tap** (Settings → Accessibility → Touch → Back Tap → Double Tap = +1 cigarette, Triple Tap = +1 weed); **Siri** ("Hey Siri, log a cigarette"); the **Action button** (iPhone 15 Pro and later); home-screen icons.
- Rate-limited, logged (`taskflow_api_log`: endpoint, at, ok), and every write is the same as doing it in the app (realtime updates the open app).

## 20. Offline (revision 3)
- Writes made offline are saved in an on-device queue (IndexedDB) with client-generated ids and replayed in order when back online; replays are idempotent (upsert on id). Covers counter taps, timer start/pause/stop, captures, task create/complete, shift and nap/reset actions.
- Optimistic UI shows the change immediately; a small "3 waiting to sync" chip; failures after retries show a list to retry or discard. Conflicts: last write wins on `updated_at`.
- Reading offline: the last loaded data stays visible (cached), the banner says it's offline, but logging still works.

## 21. Reminders, notifications and app badge (revision 3)
- **Web Push** (works on iPhone for home-screen apps, iOS 16.4+, after allowing notifications; and on the Mac). Subscriptions in `taskflow_push_subscriptions`. A scheduled Edge Function **`taskflow-notify`** (pg_cron every 5 min, job named `taskflow_notify`) sends what's due.
- Each type can be turned on/off and tuned in Settings → Notifications, with **quiet hours**: deadline reminders (days before, default 7, 2, 1, and the morning of) · morning digest (time; due today + top 3) · evening shutdown nudge · weekly review nudge · **timer still running** after N hours · **on break** longer than N min · **reset/nap** running long · **counter limit reached** (off by default) · shift starting in 60 min (phase 6 schedule).
- **App badge** (Badging API) = missed + due today, updated when the app is open and by pushes.
- In-app: the timer asks "Still going?" after N hours (setting) even without push.

## 22. Scheduled shifts and free time (revision 3)
- Enter upcoming shifts ahead of time (per job: date, start, end — or from a schedule photo read by the phase-12 function, confirmed before saving). A scheduled shift is a `taskflow_shifts` row with `state = scheduled`; punching in on that day fills the scheduled times.
- The calendar shows scheduled shifts; week view shows **free blocks** between shifts and sleep; a task placed on a time that overlaps a shift is flagged.
- Weekly review shows scheduled vs worked hours.

## 23. Claude weekly summary and patterns (revision 3)
- **Weekly summary:** a button in the weekly review (and optional automatic Sunday run) calls Edge Function `taskflow-weekly-summary`, which builds the week's numbers server-side (time by tag, goals, tasks, activities, counters, mood/energy/sleep, task titles — no notes bodies unless I turn that on) and asks Claude (API key in Supabase secrets) for a short, honest summary: what went well, what slipped, one suggestion. Stored in `taskflow_weeks.ai_summary`. Shows the approximate cost. Off by default for the automatic run.
- **Patterns** (Insights → Patterns, after 14+ days of data): daily cigarettes/weed vs sleep, study minutes, mood, energy, work hours; side-by-side lines and a plain-language correlation ("on days you slept < 6 h you smoked 2.1 more on average") with a "this is correlation, not cause" note.

## 24. Power features (revision 3)
- **Quick add in plain words** (tested parser, live preview chips before saving): dates (`today`, `tomorrow`, `fri`, `nov 9`, `next week`, `in 2 weeks`), `by <date>` → window ending then, `!deadline` → hard deadline, `#dsa` → tag (fuzzy, sub-tags too), `~1h30` → estimate, `@Anikait` → owner. Example: `Pass G2 by nov 9 #personal !deadline`.
- **Cmd+K command menu** (Mac) — search tasks, notes, projects, tags; run any action (new task, start timer on…, +1 cigarette, start reset, punch in); and keyboard shortcuts (`n` new task, `space` start/pause timer, `c` capture, `?` list).
- **Trash:** delete = soft delete (`deleted_at`) on tasks, activity logs (sessions), notes, sessions, counter events, projects, goals; Settings → Trash to restore; emptied after 30 days. Every query, view and stat excludes deleted rows.
- **Export:** CSV per table and a full JSON export from Settings.

## 15. Later (not in v1)
Apple Health sleep and workout import through `taskflow-api` (§19); share-sheet capture from other apps. (Reminders, Shortcuts and offline moved into v1 — §19–§21; scheduled recurring tasks dropped in revision 4 — activity buttons (§16) cover repeat activities.)

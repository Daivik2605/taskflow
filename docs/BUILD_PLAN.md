# TaskFlow — build plan (one phase per Claude Code session)

How to run a phase: open a terminal in `PersonalOS/taskflow/`, start Claude Code (for API-credit billing: `ANTHROPIC_API_KEY=sk-ant-... claude` — inline, not `export`), then paste the phase's prompt. Claude Code plans first and waits for your OK.

Every phase ends with `npm test`, `npm run typecheck` and `npm run build` passing, the **Status** line below updated, and a hand-check list for Mac + iPhone. SPEC = `docs/SPEC.md`.

---

### Phase 0 — Setup (you, ~15 min)
**Status:** not started
1. This folder already has `CLAUDE.md` and `docs/`. Run `git init` here (it's its own repo; the root repo ignores it).
2. Supabase (the one `personal-os` project): Authentication → Email → "Confirm email" is **off** (already, from the other apps). Copy the Project URL and anon key — you'll paste them into `.env.local` in phase 1.
3. Make an Anthropic API key at platform.claude.com if you want this app built on API credits.

### Phase 1 — Scaffold, full schema, sign-in, seed
**Status:** built — pending your checks (run the schema in the SQL Editor, sign in on the Mac and iPhone, look at the tables). `npm test` (44), `typecheck`, `build` and `test:schema` pass.
> Read CLAUDE.md, ../CLAUDE.md, ../docs/ARCHITECTURE.md, ../docs/CONTRACT.md, ../docs/ROADMAP.md and docs/SPEC.md. Do Phase 1 of docs/BUILD_PLAN.md: plan first and wait for my approval.
> Scaffold Vite + React + TS + Tailwind + React Router + Vitest on port 5175 (strict) per SPEC §1, with the app shell (bottom tabs on phone: Today · Tasks · Timer · Calendar · More; sidebar on desktop; More = Inbox, Projects, Work, Settings), dark mode, an offline/error banner, and placeholder screens. Write `supabase/taskflow_schema.sql` with **every** table, index, trigger, bucket and RLS policy from SPEC §2 (contract views come in phase 11; `taskflow_end_reset` in phase 5), realtime publication included, idempotent — prove it by running it twice against a local Postgres with Supabase stand-ins (as chart-journal's schema was tested). Supabase client from `.env.local` (+ `.env.example`), sign-in/sign-out, first-sign-in seeding per SPEC §2. Build `src/lib/time.ts` with tests (Toronto today, day of a moment, split an interval across days incl. DST change days, duration format). Write README.md (setup, run, what to paste in the SQL editor) and docs/DATA_CONTRACT.md (stub: "views coming in phase 11").

**Done when:** schema runs twice cleanly; signing in seeds areas, presets, the AEO Studio project, the Tim Hortons job, actions and settings exactly once; `checks.sql` queries 1–5 show nothing for `taskflow_` tables (add `taskflow` to the prefix lists in `../supabase/checks.sql` queries 1 and 8 first).
**You:** run the schema in the SQL Editor, sign in on the Mac, look at the tables in Supabase.

### Phase 2 — Tasks + Today
**Status:** built — pending your checks (add real tasks, check the counts, open two windows). `npm test` (109), `typecheck` and `build` pass. No schema change this phase, so no SQL to run.
> Do Phase 2 of docs/BUILD_PLAN.md (SPEC §3): plan first. Task sheet with sub-tasks, quick add, Tasks screen with filters/grouping/complete/reorder, Today screen (tasks overdue/today/no date, done · missed · left counters for today/week/all), `src/lib/tasks.ts` with tests for missed, done-late and counters around midnight and DST. Realtime sync of tasks between two open windows. Settings → Areas (add, rename, kind, color, archive, reorder).

**Done when:** "Pass G2 — due 2026-11-09 — Life admin" can be added, edited, completed; a task due yesterday counts as missed; two browser windows stay in sync.
**You:** add your real tasks; check the counts make sense.

### Phase 2.5 — Tags, task dates, smoke counters, Insights (revision 2)
**Status:** not started
> Read docs/SPEC.md — the "What TaskFlow must answer" and "Words used" notes at the top, §2 (changed rows), §2b, §3, §13 and §14 — then do Phase 2.5 of docs/BUILD_PLAN.md: plan first and wait for my approval. This changes data that already exists in my real Supabase project, so the migration must be safe.
>
> **1. Schema (extend `supabase/taskflow_schema.sql`, idempotent, never drops data):**
> - `taskflow_areas`: add `parent_id` (self-reference, `on delete restrict`), replace the `kind` check with `work · hustle · study · wellness · break · sleep · personal` **after** migrating existing values, replace `unique (user_id, name)` with unique `(user_id, parent_id, name)` (NULLS NOT DISTINCT, or a coalesce-based unique index), a trigger that keeps a sub-tag's `kind` equal to its parent's and rejects a third level.
> - `taskflow_tasks`: add `start_on date`, `hard_deadline boolean not null default false`, `estimate_minutes int`, check `start_on <= due_on` when both set, index `(user_id, start_on)`.
> - New `taskflow_counters` and `taskflow_counter_events` per SPEC §2 (RLS, own-rows policy, updated_at trigger, realtime publication, index `(user_id, day)`).
> - `taskflow_settings.week_starts_on int default 1`.
> - A second job row **Oland Stations** (null rate/anchor) and its shift action.
>
> **2. Migration of my existing data** (a guarded block in the schema file that only runs while old kinds exist, so re-runs do nothing). Rename/re-parent existing rows **in place, keeping their ids**, so tasks, presets, projects and jobs keep their links:
> | Existing | Becomes |
> |---|---|
> | DSA, Trading, SQL | Study / same name (DSA and Trading keep `app_key`) |
> | Tableau cert, Databricks cert | Study / Tableau Data Analyst Certification, Databricks Data Analyst Certification |
> | AEO Studio | Hustle / AEO Studio |
> | Work — Tim Hortons | Work / Tim Hortons |
> | Wellbeing | Wellness (parent) |
> | Sleep | Sleep (parent) |
> | Life admin | Personal (parent) |
> | Projects, Leisure, People | archived; their tasks/presets move to Personal, Break, Break respectively |
> Create the missing parents (Work, Hustle, Study, Break) and sub-tags (Oland Stations, Commute, Kriya, Padmasadna, Home Workout, Gym); move presets to Wellness / Kriya (renamed "Kriya") and Wellness / Padmasadna (renamed "Padmasadna"); seed the two counters. Update `src/lib/seed.ts` so a **new** account gets the same end state directly. Test the migration on the local Postgres: load phase-1 seed data plus sample tasks (one in Projects, one in Leisure), run the new schema twice, assert every task/preset still points at the right tag and nothing was deleted.
>
> **3. UI:**
> - Everywhere the UI says "Area", say **Tag**; the free-text tags field becomes **Labels**.
> - **Settings → Tags**: tree editor — add parent, add sub-tag, rename, color, emoji, reorder, move a sub-tag to another parent, archive, merge (reassign everything, then archive). **Settings → Counters**: add, rename, emoji, reorder, archive.
> - **Tag picker** component (grouped, sub-tags indented, recent first) used by the task sheet now and by the timer/presets later.
> - **Task sheet "When"** control: No date · On a day · Window (This week, Next 7 days, Next 2 weeks, This month, Custom range) · Deadline (+ optional "start working from"); optional estimate.
> - **Tasks screen** views Today · Upcoming · Deadlines · Anytime · Done, tag filter where a parent includes its sub-tags, row chips per SPEC §3 (window days left, deadline countdown with amber/red, Missed / Late).
> - **Today**: the two counter buttons at the top (count today, "last: Xh ago", tap +1, Undo toast, long-press to add at a past time / edit today's taps); missed tasks to reschedule or drop; deadlines in the next 14 days; today; in a window; counters done · missed · deadlines missed · left.
> - **Insights** tab (phone tabs become Today · Tasks · Timer · Insights · More; Calendar moves under More until phase 8): **Day** log (tasks completed + counter taps for now, ‹ › days) and **Range** (day/week/month/custom) with tasks done / tasks missed / deadlines missed (with lists) and the counter stats from SPEC §13 (today, week, month, all time, per-day bars 30 days, per-week 12, per-month 12, 7/30-day average, days since last, zero days). Use Recharts.
>
> **4. Logic and tests** (`src/lib/tasks.ts`, new `src/lib/tags.ts`, `src/lib/counters.ts`): window presets and week start; upcoming vs active; task missed vs deadline missed vs done late; tag tree rules (two levels, kind inheritance, parent includes children for filters and totals); counter aggregation by Toronto day/week/month incl. DST days; undo.
>
> **5. Docs:** SPEC already describes this; update README (what SQL to run), BUILD_PLAN status, `../docs/DECISIONS.md`. Tell me exactly what to paste in the SQL Editor and what to check afterwards in the Table Editor.

**Done when:** after running the schema in my real project, my existing tasks keep their (renamed) tags, "Pass G2" can be set to a hard deadline on 9 Nov and shows its countdown; a "next 2 weeks" window task shows days left and becomes *missed* when its window ends; tasks missed and deadlines missed are counted separately; tapping 🚬 on the phone shows +1 on the Mac within seconds and Undo removes it; Insights shows per-day/week/month counter totals.
**You:** run the schema, open Settings → Tags and check the tree, retag your tasks, tap the counters for a day, look at Insights.

### Phase 3 — PWA + deploy (makes it usable on the iPhone)
**Status:** not started
> Do Phase 3 of docs/BUILD_PLAN.md (SPEC §1): plan first. vite-plugin-pwa with manifest, icons (simple generated icon), standalone display, theme colours, a `/capture` home-screen shortcut route (placeholder until phase 9), update prompt when a new version is deployed. Deploy config for Vercel (or Netlify — recommend one), SPA rewrites, env vars documented. Write the exact click-by-click steps for me: create the hosting project from this repo or via CLI, set env vars, add the deployed URL to Supabase → Authentication → URL Configuration, install on iPhone (Safari → Share → Add to Home Screen) and on Mac. Store the deployed URL in `taskflow_settings.taskflow_url`.

**Done when:** the deployed URL works on mobile data (not just home Wi-Fi), the app installs on both devices, and a task added on the phone appears on the Mac within seconds.
**You:** follow the deploy steps, install on both devices.

### Phase 4 — Timer + presets
**Status:** not started
> Do Phase 4 of docs/BUILD_PLAN.md (SPEC §4, §2b, §14): plan first. Timer screen with Start/Pause/Resume/Stop, tag (via the tag picker) + optional task, a ▶ button on every task row that starts the timer on that task with its tag, logged time and estimate-vs-actual on tasks, live comment, segments model, one active session rule (DB index + UI prompt), running bar on every screen, quick-log presets, add past session, today's sessions list with edit/delete, totals per parent tag and sub-tag for today and this week. Extend **Insights**: the Day log timeline gains sessions and presets; Range gains hours by parent/sub-tag (stacked bar per day), hours studying per study sub-tag, top tasks by time, estimate vs actual. `src/lib/timer.ts` with tests (pause/resume sums, open segment, sessions across midnight). Realtime: start on one device, pause on the other. Settings → Presets.

**Done when:** start on Mac → pause/resume → stop on phone with a comment; duration correct; closing and reopening the app keeps the timer; a preset tap logs its minutes.
**You:** use it for a real study session (started from a task) and a Kriya log; check Insights → Day.

### Phase 5 — Action tasks + Nap & reset
**Status:** not started
> Do Phase 5 of docs/BUILD_PLAN.md (SPEC §5 and §7): plan first. Action registry and pinned action buttons on Today with live state; Settings → Actions (pin, rename, reorder, hide). Nap + reset flow, popup with Undo/Edit, "Still resetting?" check, editing times. SQL: `taskflow_end_reset(p_app, p_detail, p_at)` exactly as SPEC §7 and `../docs/CONTRACT.md` → Shared calls (security invoker, idempotent, granted to authenticated) — TaskFlow's own timer start under a study, hustle or work tag calls the same function (p_app = 'taskflow'). Realtime toast when another app ended the reset. `src/lib/reset.ts` + SQL tests (run against local Postgres): ends once, second call returns `ended: false`, a `p_at` before the reset started does nothing, nap open at the end. Document the function in docs/DATA_CONTRACT.md. Then mark the "Blocked until" lines in ../InteractiveDSA/docs/BUILD_PLAN.md (Phase 3.6) and ../chart-journal/docs/BUILD_STATUS.md as unblocked — this is the one allowed edit outside this folder besides root docs.

**Done when:** start nap → Nap done → start a timer tagged Study / DSA → popup shows nap and reset minutes; calling `select taskflow_end_reset('dsa','test')` in the SQL Editor with a reset open ends it and returns the minutes.
**You:** then run `../docs/prompts/07-reset-hook.md` in InteractiveDSA (after its sync phases) and in chart-journal.

### Phase 6 — Shifts + pay rules
**Status:** not started
> Do Phase 6 of docs/BUILD_PLAN.md (SPEC §6.1–6.3): **before planning, ask me to confirm the rules for each job — Tim Hortons and Oland Stations —** (early and late clock-in rounding, clock-out rounding, break paid?, break length, after how many hours, hourly rate, pay period length and one real period start date, overtime) and set the job's defaults from my answers — the seeded job has `hourly_rate` and `pay_period_anchor` = null on purpose, so fill them from my answers and remove the "not set" notice (`PAY_NOT_SET_MESSAGE` in `src/lib/pay.ts`) only where pay is then configured. Then plan. Build `src/lib/pay.ts` as pure functions returning paid minutes, flags and a human "working" list, with tests including: 15:02 → paid from 15:05; 30-min unpaid break and 23:00 out → 7h 25m; early clock-in before the scheduled start; no break on a 6-hour shift → flag; left on break at 19:40; weekly overtime past 44 h; a shift crossing midnight. The shift action button flow (punch in/out now or at a chosen time, start/end break, add break minutes, I left on break), punch-in ends an open reset, post-shift summary, shift history with edit, store record entry with my-vs-store difference in minutes and dollars, manager-said-no-deduction → unverified. Settings → Jobs (rate and rule columns). **Commute** (SPEC §6.1): `Heading home` after punch-out starts a Work / Commute session linked to the shift, `I'm home` stops it; `Heading to work` before a shift is stopped by punch-in. Extend **Insights**: hours at work per job (paid) and commute, per day/week/month, in the Day log and Range.

**Done when:** every test case above passes, and the flow works on the phone with one hand (big buttons, no typing needed for the live path).
**You:** use it for your next real shift.

### Phase 7 — Pay periods + paystubs
**Status:** not started
> Do Phase 7 of docs/BUILD_PLAN.md (SPEC §6.4): plan first. Work screen → pay periods from the job's anchor and length, each with its shifts (unverified first), my regular/overtime paid minutes and expected gross; paystub entry with optional photo/PDF upload to the `taskflow-paystubs` bucket (signed URLs to view); side-by-side comparison with tolerance (settings); tests for period boundaries and overtime split across periods.

**Done when:** a period's expected gross matches a hand calculation, and entering a real paystub shows the difference.
**You:** enter your last paystub and compare.

### Phase 8 — Calendar, days off, sleep
**Status:** not started
> Do Phase 8 of docs/BUILD_PLAN.md (SPEC §8): plan first. Month and week calendar (no heavy calendar library unless justified), per-day shading by focus minutes, tasks due, shifts, sessions, naps/resets, days-off marking; day detail sheet; sleep check-in card on Today (pre-filled), sleep history and 14-day chart (Recharts); `src/lib/streak.ts` with tests where days off neither break nor extend a streak.

**Done when:** marking a holiday shows on the calendar and a productive (study + hustle) streak skips over it; a sleep entry lands on the wake-up day.
**You:** mark your known holidays; log tonight's sleep tomorrow.

### Phase 9 — Inbox + quick capture
**Status:** not started
> Do Phase 9 of docs/BUILD_PLAN.md (SPEC §9): plan first. Floating capture button on every screen, `/capture` route opened by the PWA home-screen shortcut (focus the box immediately), kinds, search, pin, archive, attach, markdown body, convert to task (keeps the link).

**Done when:** from the iPhone home screen, long-press → capture → typed idea is saved in under 5 seconds and shows on the Mac.
**You:** dump everything in your head into it.

### Phase 10 — Projects + agents board
**Status:** not started
> Do Phase 10 of docs/BUILD_PLAN.md (SPEC §10): plan first. Projects list with status and "going cold", project page (brief fields, tasks grouped by owner with a waiting-on filter, notes, time spent), agents board columns from `agent` tags. Fill in the seeded AEO Studio project's structure (no fake data).

**Done when:** a task owned by "Anikait" shows under his group; moving an agent card to *live* completes the task; a project untouched for 30 days shows as going cold (test with a backdated `last_touched_at`).
**You:** write the briefs for AEO Studio and your current projects.

### Phase 11 — Dashboard contract views
**Status:** not started
> Do Phase 11 of docs/BUILD_PLAN.md (SPEC §11 and ../docs/CONTRACT.md): plan first. Add the four views to `supabase/taskflow_schema.sql` (security_invoker, granted), splitting sessions/shifts/naps/resets across Toronto days in SQL; test on local Postgres with sample data that crosses midnight, includes a day off and two users (RLS). Fill docs/DATA_CONTRACT.md in the same format as ../chart-journal/docs/DATA_CONTRACT.md (columns, how computed, caveats, change log). Run ../supabase/checks.sql (queries 1–8 return nothing; add `taskflow-` to the bucket check). If the dashboard exists, note in ../docs/DECISIONS.md that its unions need TaskFlow added (don't edit dashboard files).

**Done when:** the views return correct numbers for the sample data and line up column-for-column with `trading_dashboard_daily`/`_now`.
**You:** run the schema in the SQL Editor, then `select * from taskflow_dashboard_daily order by day desc limit 7`.

### Phase 12 — Photo reading (time cards and paystubs)
**Status:** not started
> Do Phase 12 of docs/BUILD_PLAN.md (SPEC §6.5): plan first. Edge Function `supabase/functions/taskflow-read-image` (verifies the JWT, only reads the caller's own file, calls the Claude API with the image, strict JSON schema for time-card punches per day and for paystub totals, validates the response, clear errors). Upload + "Read with Claude" buttons on the shift list and paystub form, pre-filled confirmation screen, nothing saved until confirmed. Give me the exact commands to deploy the function and set the `ANTHROPIC_API_KEY` secret with the Supabase CLI. Tests for the JSON validation with sample responses.

**Done when:** a real time-card photo pre-fills the right punches, and a malformed response shows an error instead of saving.
**You:** deploy the function, set the secret, try it with a real photo.

### Phase 13 — Polish and hardening
**Status:** not started
> Do Phase 13 of docs/BUILD_PLAN.md: plan first. Go through every screen at 375px and desktop, light and dark: empty states, loading states, offline banner with writes disabled, error + retry on every write, keyboard shortcuts on desktop (n = new task, space = start/pause timer, c = capture), accessibility basics (labels, focus, contrast), performance (lazy-load Calendar and charts). Review realtime subscriptions are cleaned up. Update README and all docs.

**Done when:** a full day of real use on phone and Mac with no stuck states.

---

## Later (SPEC §15)
iOS Shortcuts / share-sheet capture · Apple Health sleep & workouts import · web-push reminders · recurring tasks · offline capture queue.

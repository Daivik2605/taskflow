# TaskFlow — build plan (one phase per Claude Code session)

How to run a phase: open a terminal in `PersonalOS/taskflow/`, start Claude Code with plain `claude` (it uses my Claude subscription; make sure `ANTHROPIC_API_KEY` is **not** set in the shell, or it bills API credits instead), then paste the phase's prompt. Claude Code plans first and waits for your OK.

Every phase ends with `npm test`, `npm run typecheck` and `npm run build` passing, the **Status** line below updated, and a hand-check list for Mac + iPhone. SPEC = `docs/SPEC.md`.

---

### Phase 0 — Setup (you, ~15 min)
**Status:** not started
1. This folder already has `CLAUDE.md` and `docs/`. Run `git init` here (it's its own repo; the root repo ignores it).
2. Supabase (the one `personal-os` project): Authentication → Email → "Confirm email" is **off** (already, from the other apps). Copy the Project URL and anon key — you'll paste them into `.env.local` in phase 1.
3. Claude Code runs on my Claude subscription (`/status` shows which login it uses). An Anthropic API key is only needed in phase 12, as a Supabase secret for the photo-reading function — that's the app calling Claude, not Claude Code.

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
**Status:** built — pending you running the SQL and checking (steps in README → "Phase 2.5: run the SQL"). `npm test` (292), `typecheck`, `build` and `npm run test:schema` (fresh install + phase-1 → revision-2 migration, both run three times) pass. The new app code needs the new SQL first; until it's run the app says "The database is out of date".
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

### Phase 2.6 — Overview strip
**Status:** built (no schema change). `src/lib/overview.ts` + `OverviewStrip` on Today; the old Today/Week/Month/All counter table was replaced by the strip. Period is remembered in `localStorage` (`taskflow-overview-period`). Time card: pass it as `children` of `<OverviewStrip>` in phase 4.
> Do Phase 2.6 of docs/BUILD_PLAN.md (SPEC §3, "Overview strip"): plan first. Add the overview strip to the top of Today with the Today · Week · Month toggle (remembered per device), cards for To do, Due today, Upcoming, Deadlines (nearest named), Missed (tasks / deadlines), Completed, 🚬 and 🌿 with change vs the previous period. Each card opens the matching Tasks view or Insights → Counters. Compute everything with the existing pure functions in `tasks.ts` / `counters.ts` (add a `overview.ts` that composes them, with tests that its numbers equal Insights' for the same range). Leave a slot for the Time card that phase 4 fills. 2-column grid on phone, one row on desktop, loading skeletons, live updates via the existing realtime subscriptions. No schema change.

**Done when:** the numbers match Insights for today, this week and this month; tapping 🚬 updates its card immediately; every card opens the right filtered view.
**You:** look at it on the phone layout (narrow the browser) and check every number against your tasks.

### Phase 2.7 — Simplify: header counters, activity buttons, task tag shortlist, no emojis (revision 4)
**Status:** not started
> Read the "Revision 4 (simplify)" note at the top of docs/SPEC.md, then §2b (task tag shortlist), §13 (counter pills), §16 (activity buttons) and §6.1 ("Add a past shift" — only read it, it's built in phase 6). Do Phase 2.7 of docs/BUILD_PLAN.md: plan first and wait for my approval.
> 1. **No emojis** anywhere in the UI, tests and seed (counters, tags, Insights, overview, settings). Text labels + colour dots. Keep the `emoji` columns in the DB but stop reading/writing them; remove the emoji field from Settings forms.
> 2. **Counter pills** in the top-left of the app header on every screen (phone and desktop): `Cig 3` · `Weed 1`, today's count, tap = +1 with Undo toast, long-press / chevron = past time, today's taps (edit/delete), "last: Xh ago". Remove the big counter buttons from Today. The overview strip's counter cards stay. Make sure the pills don't crowd the header at 375px.
> 3. **Activity buttons** (SPEC §16): extend `taskflow_presets` with `weekly_target int` (idempotent SQL); rename the UI concept to **Activities** (Settings → Activities: add, rename, tag, default minutes, weekly target, reorder, hide); seed/migrate to Kriya 35, Padmasadna 20, Home Workout 30, Gym 60 under their Wellness sub-tags (existing presets keep their ids). A row of buttons on Today under the overview: tap = a stopped `taskflow_sessions` row (`source='preset'`, one segment) of default minutes ending now, Undo toast; button shows done-today check and "N this week" / "N/target this week"; long-press = different minutes, earlier time or another day, this week's logs with delete. Pure `src/lib/activities.ts` with tests (week counts with `week_starts_on`, DST, undo). Activity minutes appear in Insights (Day log + Range by tag) — add the minimal session reading needed for that; the full timer is still phase 4.
> 4. **Task tag shortlist**: add `taskflow_areas.show_for_tasks boolean default false`; add sub-tag **Hustle / Projects**; set it true for Oland Stations, Commute, AEO Studio, Projects, Study (parent), Trading. The task sheet and quick add offer only those + "No tag"; toggle per tag in Settings → Tags. Timer/activities/Insights keep the full tree. Existing tasks keep whatever tag they have (shown normally even if not in the shortlist).
> 5. Update tests, docs (README SQL step, BUILD_PLAN status, ../docs/DECISIONS.md). Tell me exactly what SQL to run.

**Done when:** no emoji appears anywhere; `Cig`/`Weed` pills are on every screen and +1/Undo works from any page; tapping Gym logs 60 min under Wellness / Gym and shows "1 this week" (and in Insights → Day); the task sheet tag list shows exactly the six tags + No tag.
**You:** run the SQL, then tap through every screen on the phone layout.

### Phase 2.8 — Goals, targets and smoking limits
**Status:** not started
> Do Phase 2.8 of docs/BUILD_PLAN.md (SPEC §17): plan first. Schema: `taskflow_goals` (versioned with starts_on/ends_on), `taskflow_counters.reasons`, `taskflow_counter_events.reason`. `src/lib/goals.ts` (pure, tested): progress for every metric (tag minutes incl. sub-tags, counter at-most, activity count, tasks done) per day/week/month, editing creates a new version so past periods keep their old target, days off excluded from daily goals, hit-rate and streak of periods hit. UI: Settings → Goals (create, edit, pause, delete) and from a tag/counter/activity ("Set a goal"); goal progress bars on the overview (Phase 2.6 strip gets a Goals row) and in Insights (hit rate, streak). Counter pills: today vs limit (amber at, red over), live "time since last", today's longest gap and best gap this week; after a tap an optional reason chip row (editable list per counter in Settings → Counters); Insights → Counters adds reasons by count and by hour of day. Time-based goals show 0 until the timer exists (phase 4) — that's expected.

**Done when:** "Cigarettes ≤ 5/day" turns the Cig pill amber at 5 and red at 6; "Gym ≥ 3×/week" fills from activity-button taps; changing a target mid-week keeps last week's result judged on the old target; reasons are optional and show in Insights.
**You:** set your real limits and goals.

### Phase 3 — PWA + deploy (makes it usable on the iPhone)
**Status:** not started
> Do Phase 3 of docs/BUILD_PLAN.md (SPEC §1): plan first. vite-plugin-pwa with manifest, icons (simple generated icon), standalone display, theme colours, a `/capture` home-screen shortcut route (placeholder until phase 9), update prompt when a new version is deployed. Deploy config for Vercel (or Netlify — recommend one), SPA rewrites, env vars documented. Write the exact click-by-click steps for me: create the hosting project from this repo or via CLI, set env vars, add the deployed URL to Supabase → Authentication → URL Configuration, install on iPhone (Safari → Share → Add to Home Screen) and on Mac. Store the deployed URL in `taskflow_settings.taskflow_url`.

**Done when:** the deployed URL works on mobile data (not just home Wi-Fi), the app installs on both devices, and a task added on the phone appears on the Mac within seconds.
**You:** follow the deploy steps, install on both devices.

### Phase 3.5 — Offline logging
**Status:** not started
> Do Phase 3.5 of docs/BUILD_PLAN.md (SPEC §20): plan first. An IndexedDB write queue with client-generated uuids, replayed in order on reconnect, idempotent (upsert on id); covers counter taps (+ reason), timer actions (once built — design the queue so later phases plug in), captures, task create/complete, activity-button taps. Optimistic UI, a "N waiting to sync" chip, a retry/discard list after repeated failures, last-write-wins on `updated_at`. Cache the last loaded data (service worker / IndexedDB) so the app opens offline. Replace the phase-1 "writes disabled offline" behaviour with queued writes. Tests for ordering, duplicates on replay and conflicts.

**Done when:** in airplane mode on the iPhone, tap 🚬 three times and complete a task; turn the network on → the Mac shows exactly 3 taps and the completed task, no duplicates.
**You:** try it on the subway or with airplane mode.

### Phase 3.6 — iPhone Shortcuts, Back Tap and Siri
**Status:** not started
> Do Phase 3.6 of docs/BUILD_PLAN.md (SPEC §19): plan first. Edge Function `supabase/functions/taskflow-api` with personal API tokens (`taskflow_api_tokens` hashed, `taskflow_api_log`, Settings → Shortcuts to create/copy-once/revoke), acting only on the token owner's rows; endpoints `counter`, `capture`, `timer/start`, `timer/stop`, `activity/log` (timer endpoints return a clear "timer not built yet" until phase 4 if needed), short spoken-friendly replies, rate limiting, tests (Deno) for auth, wrong user, revoked token and each endpoint. Exact deploy commands (Supabase CLI) and a click-by-click guide with screenshots-in-words for: building each Shortcut (Get Contents of URL, POST, JSON, header with the token), Back Tap double = +1 cigarette and triple = +1 weed, Siri phrases, Action button, home-screen icons. Record in ../docs/DECISIONS.md that this Edge Function uses the service-role key server-side only.

**Done when:** double-tapping the back of the iPhone adds a cigarette that appears in the open app within seconds; "Hey Siri, log a weed" works; a revoked token is rejected.
**You:** deploy the function, create a token, set up Back Tap and Siri.

### Phase 4 — Timer + presets
**Status:** not started
> Do Phase 4 of docs/BUILD_PLAN.md (SPEC §4, §2b, §14): plan first. Timer screen with Start/Pause/Resume/Stop, tag (via the tag picker) + optional task, a ▶ button on every task row that starts the timer on that task with its tag, logged time and estimate-vs-actual on tasks, live comment, segments model, one active session rule (DB index + UI prompt), running bar on every screen, quick-log presets, add past session, today's sessions list with edit/delete, totals per parent tag and sub-tag for today and this week. Fill the overview strip's **Time** card (study, hustle, work hours for the period). Extend **Insights**: the Day log timeline gains sessions and presets; Range gains hours by parent/sub-tag (stacked bar per day), hours studying per study sub-tag, top tasks by time, estimate vs actual. `src/lib/timer.ts` with tests (pause/resume sums, open segment, sessions across midnight). Realtime: start on one device, pause on the other. Settings → Presets. Also: in-app "Still going?" after N hours (setting) with "it ended at…"; timer actions go through the offline queue (3.5); the `timer/start` and `timer/stop` API endpoints (3.6) now work; time-based goals (2.8) now fill; long-press on an activity button gains "start timer instead".

**Done when:** start on Mac → pause/resume → stop on phone with a comment; duration correct; closing and reopening the app keeps the timer; a preset tap logs its minutes.
**You:** use it for a real study session (started from a task) and a Kriya log; check Insights → Day.

### Phase 4.2 — Plan the day, shut down the day, weekly review
**Status:** not started
> Do Phase 4.2 of docs/BUILD_PLAN.md (SPEC §18): plan first. Schema: `taskflow_days`, `taskflow_weeks`. Morning plan card (Top 3, today's tasks/deadlines, quick add, energy); evening shutdown (time by tag, tasks, counters, goals; each open task → tomorrow / pick a day / no date / drop; activities done today; mood, energy, note) at a configurable time; weekly review screen (last week vs the week before: hours by tag, planned vs actual from goals, goals hit, tasks done/missed/deadlines missed, activities vs weekly targets, counters, mood/energy/sleep averages, next 14 days' deadlines; set next week's goals; note; browse past reviews). Top 3 shows pinned on Today and in the overview. Pure functions + tests for the summaries (they must equal Insights for the same range).

**Done when:** an evening shutdown rolls today's unfinished tasks to tomorrow in under a minute, and the weekly review numbers equal Insights for that week.
**You:** do tonight's shutdown and this Sunday's review.

### Phase 4.5 — Dashboard contract views (moved up from phase 11 so the dashboard can start early)
**Status:** not started
> Do Phase 4.5 of docs/BUILD_PLAN.md (SPEC §11 and ../docs/CONTRACT.md): plan first. Add the five views (`taskflow_dashboard_daily`, `_now`, `_area_daily`, `_days_off`, `_deadlines`) to `supabase/taskflow_schema.sql` (security_invoker, granted to authenticated, append-only once released), splitting sessions, shifts, naps and resets across Toronto days in SQL. All the tables already exist from phase 1, so write **every** column from SPEC §11 now, even for features not built yet (shifts, resets, sleep, days off): they return 0/null until those phases add data. Test on local Postgres with fixture rows for every source (including a shift and a reset), a session crossing midnight, a DST day, a day off and two users (RLS). Make the deep-link routes from SPEC §11 work (`/timer?tag=` pre-selects the tag without starting). Fill docs/DATA_CONTRACT.md in the same format as ../chart-journal/docs/DATA_CONTRACT.md (columns, how computed, caveats, change log, deep links). Run ../supabase/checks.sql (queries 1–8 return nothing). Note in ../docs/DECISIONS.md that the views are released. Don't edit dashboard files.

**Done when:** the views return correct numbers for the fixtures and line up column-for-column with `trading_dashboard_daily`/`_now`; `select * from taskflow_dashboard_daily order by day desc limit 7` shows today's study minutes from a real timer session.
**You:** run the schema in the SQL Editor, run that query. Then the dashboard can be built (`../docs/prompts/04-dashboard.md`) while TaskFlow continues with phase 5.

### Phase 5 — Action tasks + Nap & reset
**Status:** not started
> Do Phase 5 of docs/BUILD_PLAN.md (SPEC §5 and §7): plan first. Action registry and pinned action buttons on Today with live state; Settings → Actions (pin, rename, reorder, hide). Nap + reset flow, popup with Undo/Edit, "Still resetting?" check, editing times. SQL: `taskflow_end_reset(p_app, p_detail, p_at)` exactly as SPEC §7 and `../docs/CONTRACT.md` → Shared calls (security invoker, idempotent, granted to authenticated) — TaskFlow's own timer start under a study, hustle or work tag calls the same function (p_app = 'taskflow'). Realtime toast when another app ended the reset. Add `nap/start`, `nap/done`, `reset/done` to `taskflow-api` (3.6) and the offline queue. `src/lib/reset.ts` + SQL tests (run against local Postgres): ends once, second call returns `ended: false`, a `p_at` before the reset started does nothing, nap open at the end. Document the function in docs/DATA_CONTRACT.md. Then mark the "Blocked until" lines in ../InteractiveDSA/docs/BUILD_PLAN.md (Phase 3.6) and ../chart-journal/docs/BUILD_STATUS.md as unblocked — this is the one allowed edit outside this folder besides root docs.

**Done when:** start nap → Nap done → start a timer tagged Study / DSA → popup shows nap and reset minutes; calling `select taskflow_end_reset('dsa','test')` in the SQL Editor with a reset open ends it and returns the minutes.
**You:** then run `../docs/prompts/07-reset-hook.md` in InteractiveDSA (after its sync phases) and in chart-journal.

### Phase 6 — Shifts + pay rules
**Status:** not started
> Do Phase 6 of docs/BUILD_PLAN.md (SPEC §6.1–6.3): **before planning, ask me to confirm the rules for each job — Tim Hortons and Oland Stations —** (early and late clock-in rounding, clock-out rounding, break paid?, break length, after how many hours, hourly rate, pay period length and one real period start date, overtime) and set the job's defaults from my answers — the seeded job has `hourly_rate` and `pay_period_anchor` = null on purpose, so fill them from my answers and remove the "not set" notice (`PAY_NOT_SET_MESSAGE` in `src/lib/pay.ts`) only where pay is then configured. Then plan. Build `src/lib/pay.ts` as pure functions returning paid minutes, flags and a human "working" list, with tests including: 15:02 → paid from 15:05; 30-min unpaid break and 23:00 out → 7h 25m; early clock-in before the scheduled start; no break on a 6-hour shift → flag; left on break at 19:40; weekly overtime past 44 h; a shift crossing midnight. The shift action button flow (punch in/out now or at a chosen time, start/end break, add break minutes, I left on break), punch-in ends an open reset, post-shift summary, shift history with edit, store record entry with my-vs-store difference in minutes and dollars, manager-said-no-deduction → unverified. Settings → Jobs (rate and rule columns). **Commute** (SPEC §6.1): `Heading home` after punch-out starts a Work / Commute session linked to the shift, `I'm home` stops it; `Heading to work` before a shift is stopped by punch-in. Extend **Insights**: hours at work per job (paid) and commute, per day/week/month, in the Day log and Range. **Scheduled shifts** (SPEC §22): enter upcoming shifts per job (`state = scheduled`), punch-in on that day pre-fills the scheduled times. Add `shift/punch-in`, `shift/break`, `shift/punch-out`, `commute/start`, `commute/stop` to `taskflow-api` and the offline queue, and update the Shortcuts guide.

**Done when:** every test case above passes, and the flow works on the phone with one hand (big buttons, no typing needed for the live path).
**You:** use it for your next real shift.

### Phase 7 — Pay periods + paystubs
**Status:** not started
> Do Phase 7 of docs/BUILD_PLAN.md (SPEC §6.4): plan first. Work screen → pay periods from the job's anchor and length, each with its shifts (unverified first), my regular/overtime paid minutes and expected gross; paystub entry with optional photo/PDF upload to the `taskflow-paystubs` bucket (signed URLs to view); side-by-side comparison with tolerance (settings); tests for period boundaries and overtime split across periods. Also add the view `taskflow_dashboard_paystubs` from SPEC §11 (security_invoker, granted, append-only; cents as integers), tested on local Postgres, and document it in docs/DATA_CONTRACT.md — the Money app reads it.

**Done when:** a period's expected gross matches a hand calculation, and entering a real paystub shows the difference.
**You:** enter your last paystub and compare.

### Phase 8 — Calendar, days off, sleep
**Status:** not started
> Do Phase 8 of docs/BUILD_PLAN.md (SPEC §8): plan first. Month and week calendar (no heavy calendar library unless justified), per-day shading by productive (study + hustle) minutes, tasks due, activity logs, scheduled and worked shifts, sessions, naps/resets, days-off marking; week view with **free blocks** between shifts and sleep, flagging tasks that overlap a shift (SPEC §22); day detail sheet; sleep check-in card on Today (pre-filled), sleep history and 14-day chart (Recharts); `src/lib/streak.ts` with tests where days off neither break nor extend a streak.

**Done when:** marking a holiday shows on the calendar and a productive (study + hustle) streak skips over it; a sleep entry lands on the wake-up day.
**You:** mark your known holidays; log tonight's sleep tomorrow.

### Phase 8.5 — Reminders, notifications and app badge
**Status:** not started
> Do Phase 8.5 of docs/BUILD_PLAN.md (SPEC §21): plan first. Web Push with VAPID keys (generated and stored as Supabase secrets; public key in the app), `taskflow_push_subscriptions`, a "Turn on notifications" flow that explains iOS needs the home-screen app (16.4+); Edge Function `taskflow-notify` run by pg_cron every 5 minutes (job `taskflow_notify`) that sends due notifications once (dedupe log), honours quiet hours and every per-type setting in Settings → Notifications (deadline reminders with editable days-before list, morning digest, evening shutdown nudge, weekly review nudge, timer still running, long break, long nap/reset, counter limit reached — off by default, shift starting soon). Badging API: missed + due today. Tests for the "what's due now" logic (pure) incl. quiet hours across midnight and DST. Exact setup commands.

**Done when:** a deadline 2 days away sends exactly one push at the set time on the iPhone; quiet hours hold it until morning; the app icon badge shows missed + due today.
**You:** allow notifications on the iPhone home-screen app and the Mac; tune the settings.

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

### Phase 11 — Re-verify the dashboard views with real data
**Status:** not started
> The views were built in Phase 4.5. Do Phase 11 of docs/BUILD_PLAN.md: plan first. Now that shifts, paystubs, resets, days off, sleep, inbox and projects exist (phases 5–10), re-run the view tests with fixtures from every one of them, compare a week of my real data against Insights (the numbers must agree), fix any column that is wrong without renaming or reordering (append-only; if a meaning must change, bump `contract_version` and record it), update docs/DATA_CONTRACT.md's change log, and run ../supabase/checks.sql.

**Done when:** for one real week, dashboard view totals match TaskFlow Insights for productive, work, sleep and counters.
**You:** compare the dashboard with Insights for last week.

### Phase 12 — Photo reading (time cards and paystubs)
**Status:** not started
> Do Phase 12 of docs/BUILD_PLAN.md (SPEC §6.5): plan first. Edge Function `supabase/functions/taskflow-read-image` (verifies the JWT, only reads the caller's own file, calls the Claude API with the image, strict JSON schema for time-card punches per day and for paystub totals, validates the response, clear errors). Upload + "Read with Claude" buttons on the shift list and paystub form, pre-filled confirmation screen, nothing saved until confirmed. Also read a **work schedule photo** into scheduled shifts (SPEC §22), confirmed before saving. Give me the exact commands to deploy the function and set the `ANTHROPIC_API_KEY` secret with the Supabase CLI. Tests for the JSON validation with sample responses.

**Done when:** a real time-card photo pre-fills the right punches, and a malformed response shows an error instead of saving.
**You:** deploy the function, set the secret, try it with a real photo.

### Phase 12.5 — Claude weekly summary + Patterns
**Status:** not started
> Do Phase 12.5 of docs/BUILD_PLAN.md (SPEC §23): plan first. Edge Function `taskflow-weekly-summary` (JWT-verified; builds the week's numbers server-side; sends numbers + task titles only — note bodies only if a setting allows; asks Claude for a short honest summary: went well / slipped / one suggestion; stores it in `taskflow_weeks.ai_summary`; returns token usage so the UI shows the approximate cost). Button in the weekly review; optional automatic Sunday run via pg_cron, off by default. Insights → **Patterns** (after 14+ days): daily cigarettes/weed vs sleep, study minutes, mood, energy, work hours — paired line charts and plain-language correlations with a "correlation, not cause" note; pure, tested stats functions.

**Done when:** a summary for last week appears in the review with its cost; Patterns shows real comparisons once 14 days exist and a friendly "not enough data yet" before.
**You:** generate your first weekly summary.

### Phase 13 — Polish and hardening
**Status:** not started
> Do Phase 13 of docs/BUILD_PLAN.md: plan first. Go through every screen at 375px and desktop, light and dark: empty states, loading states, offline banner with writes disabled, error + retry on every write, keyboard shortcuts on desktop (n = new task, space = start/pause timer, c = capture), accessibility basics (labels, focus, contrast), performance (lazy-load Calendar and charts). Review realtime subscriptions are cleaned up. Update README and all docs.

**Done when:** a full day of real use on phone and Mac with no stuck states.

### Phase 13.5 — Plain-words quick add, Cmd+K, trash and export
**Status:** not started
> Do Phase 13.5 of docs/BUILD_PLAN.md (SPEC §24): plan first. `src/lib/quickadd.ts` parser (dates, `by`, `!deadline`, `#tag` fuzzy incl. sub-tags, `~estimate`, `@owner`) with a large test table, live preview chips in every quick-add box; Cmd+K command menu (search tasks/notes/projects/tags, run any action) and a `?` shortcuts sheet; soft delete (`deleted_at`) on tasks, notes, sessions (incl. activity logs), counter events, projects, goals with Settings → Trash (restore, auto-empty after 30 days via pg_cron) — and make sure every query, view and stat excludes deleted rows (re-run the view tests); CSV per table + full JSON export in Settings.

**Done when:** `Pass G2 by nov 9 #personal !deadline` creates the right task; Cmd+K → "+1 cigarette" works; a deleted task disappears from every number and comes back on restore.
**You:** use quick add for a day.

---

## Later (SPEC §15)
Apple Health sleep & workouts import (through `taskflow-api`) · share-sheet capture from other apps.

## Order at a glance
2.6 Overview → 2.7 Simplify (counter pills, activity buttons, task tags, no emojis) → 2.8 Goals → 3 iPhone install → 3.5 Offline → 3.6 Shortcuts/Back Tap → 4 Timer → 4.2 Plan/shutdown/review → 4.5 Dashboard views → 5 Nap & reset → 6 Shifts → 7 Paystubs → 8 Calendar → 8.5 Notifications → 9 Inbox → 10 Projects → 11 Re-verify views → 12 Photo reading → 12.5 Claude summary + Patterns → 13 Polish → 13.5 Quick add, Cmd+K, trash.

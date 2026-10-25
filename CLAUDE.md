# TaskFlow — app rules for Claude Code

Read `../CLAUDE.md` (system rules — they all apply here), then `docs/SPEC.md` (what to build) and `docs/BUILD_PLAN.md` (phase prompts and status). Work on **one phase per session**: plan first, wait for approval, build, stop.

- App key `taskflow`, prefix `taskflow_` (buckets `taskflow-`), dev port **5175** strict.
- All SQL lives in `supabase/taskflow_schema.sql`: idempotent, safe to re-run, never drops user data; later phases **extend** it. Tell me exactly what to run in the Supabase SQL Editor at the end of any phase that changes it.
- Days are America/Toronto dates via `src/lib/time.ts` only — never the browser's local date.
- Business rules live in pure, unit-tested modules in `src/lib/` (time, tasks, timer, pay, reset, streak). Components stay thin.
- Anon key only, in `.env.local` (and in the hosting provider's env settings). The Claude API key exists only as a Supabase Edge Function secret — never in this repo or the browser.
- Edge Functions (`supabase/functions/taskflow-*`) verify the caller (JWT or hashed personal API token) and scope every query to that one user. The service-role key is used only inside functions that have no user session (`taskflow-api`, `taskflow-notify`), never in app code. Secrets (Claude API key, VAPID keys) live only in Supabase secrets.
- Everything the user can configure (routines, goals, tags, counters, presets, reminders, job rules) is editable and pausable, and edits apply from today forward without rewriting history.
- Other apps touch TaskFlow **only** through `taskflow_end_reset` (`../docs/CONTRACT.md` → Shared calls). Its signature and return shape are an API: change only by adding, and record it in `docs/DATA_CONTRACT.md` and `../docs/DECISIONS.md`.
- Contract views (`taskflow_dashboard_*`) are append-only once released.
- Every phase ends with `npm test`, `npm run typecheck` and `npm run build` passing, and a list of what I should check by hand on the Mac **and** the iPhone.
- At the end of each phase: update the phase's **Status** in `docs/BUILD_PLAN.md`, and `docs/DATA_CONTRACT.md`, `../docs/DECISIONS.md` and the registry in `../CLAUDE.md` for anything that changed.
- Never run git; I do version control.
- Never kill processes by name or pattern (`pkill -f vite`, `killall node`): other PersonalOS apps run on this Mac. Only stop a process you started, by its PID, or ask me.

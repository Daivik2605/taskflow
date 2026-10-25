# TaskFlow

Tasks, timer, shifts and pay, nap + reset, calendar with days off, inbox and project briefs — one app of PersonalOS. Used on Mac and iPhone. Spec: `docs/SPEC.md`; phases: `docs/BUILD_PLAN.md`; rules for Claude Code: `CLAUDE.md`.

Status: **phase 2** — tasks (sheet, sub-tasks, quick add, filters, reorder), Today with counters, Settings → Areas, realtime task sync. Timer, calendar, inbox, projects and work are placeholders until their phases.

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
| `npm test` | unit and component tests (time, tasks, areas, seed, pay config, theme, shell, Today/Tasks, task sheet) |
| `npm run typecheck` | TypeScript |
| `npm run build` | production build into `dist/` |
| `npm run test:schema` | proves the schema: runs it twice (plus once over data) on a throwaway local Postgres with Supabase stand-ins, then checks RLS, isolation, unique indexes, triggers and realtime. Needs Postgres 15+ from Homebrew (`PGBIN` to override). Never touches Supabase. |

## Pay is not set up yet
The Tim Hortons job is seeded with **no hourly rate and no pay-period start date**. Wherever pay appears, the app says "Set your rate and pay period in Settings → Jobs" until both are set (phase 6).

## Layout
- `src/lib/` — pure, tested logic (`time.ts` = the only place days are computed, America/Toronto).
- `src/app/` — shell, navigation, auth, connection banner. `src/screens/` — one file per screen (thin).
- `supabase/taskflow_schema.sql` — the whole database for this app, extended (never rewritten) by later phases.

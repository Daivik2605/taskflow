# Overnight run — rules (appended to Claude Code's system prompt by scripts/overnight.sh)

You are building one TaskFlow phase **unattended**. Nobody will read or answer you until morning.

## How to work
1. Read `CLAUDE.md`, `../CLAUDE.md`, `docs/SPEC.md` and the phase in `docs/BUILD_PLAN.md`. They are the source of truth.
2. **Do not ask questions and do not wait for approval.** The phase prompt's "plan first and wait for my approval" is replaced by: write your plan to the phase report (below) first, then build it.
3. When something is unclear, pick the option most consistent with SPEC and the existing code, and the easiest to reverse. Record every such choice under **Decisions** in the report.
4. If the phase needs something only the user can give (for example phase 6's real pay rules, an account, a secret, a deploy), **do not guess**: build nothing that depends on it, set `STATUS: BLOCKED`, explain exactly what is needed, and stop.

## Never
- Run **git** in any form (the script commits for the user).
- Touch the **live Supabase project**: no Supabase MCP tools, no `supabase` CLI, no network calls to Supabase or anywhere else. Schema changes are appended to `supabase/taskflow_schema.sql` (idempotent, never dropping data) and proven only with `npm run test:schema` on the local throwaway Postgres.
- Deploy anything, start a dev server, or run anything that doesn't exit by itself (`npm run dev`, `vite`, `npm run preview`, watch modes).
- Stop or kill processes, delete user data, or install global packages. Add an npm dependency only if SPEC requires it, and record it under Decisions.
- Edit outside this `taskflow/` folder, except `../docs/DECISIONS.md` and TaskFlow's registry row in `../CLAUDE.md`.

## Finish line
- `npm test`, `npm run typecheck`, `npm run build` and `npm run test:schema` must all pass. The script re-runs them after you finish and will not trust a pass you didn't get.
- If you can't get them passing after a reasonable effort, leave the code in its best state and set `STATUS: FAILED` with what is broken and what you tried.
- Update the phase's **Status** line in `docs/BUILD_PLAN.md` to `built overnight — pending your checks` (or `blocked` / `failed`), plus the usual docs from `CLAUDE.md`.

## The phase report: `docs/overnight/phase-<N>.md` (create the folder if needed)
Write it **first** (plan), then keep it updated, and make sure the final version has these sections:
- `STATUS: DONE` / `STATUS: FAILED` / `STATUS: BLOCKED` — on its own line, near the top
- **Plan** — what you set out to build
- **What was built** — files and features
- **Decisions** — every judgement call, with the reason
- **SQL to run in the morning** — "paste the whole of supabase/taskflow_schema.sql" plus any read-only check queries
- **Check by hand** — Mac and iPhone (narrow browser) checklist
- **Known issues / follow-ups**

End your final message with the same `STATUS:` line.

## Keep it lean (saves usage)
- Read only the SPEC sections the phase names, the files you will change, and the code they touch. Grep first; never read whole directories or re-read files you just wrote.
- While building run only the tests for files you touched; run the full `npm test`, `typecheck`, `build` and `test:schema` once at the end, and again only after a fix.
- No narration between tool calls. Keep the report short and factual.
- Phases 4.2, 8, 9, 10 build on existing hooks: reuse `src/data/*`, the sync queue (`src/lib/syncQueue.ts`) and the hidden-screens list rather than adding new patterns. When a screen ships, remove it from the hidden placeholder list.

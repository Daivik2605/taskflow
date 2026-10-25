#!/usr/bin/env bash
# TaskFlow overnight builder.
# Runs BUILD_PLAN phases one after another, each in a fresh headless Claude Code session,
# on a new local git branch, and stops at the first problem. Nothing touches the live
# database, nothing is deployed, nothing is pushed.
#
# Usage (from anywhere):
#   ANTHROPIC_API_KEY=sk-ant-... ./scripts/overnight.sh            # default phases: 2.8 4 4.2
#   ANTHROPIC_API_KEY=sk-ant-... ./scripts/overnight.sh 2.8 4      # choose phases
#   Without ANTHROPIC_API_KEY it uses your Claude subscription login instead.
#
# Optional settings (environment variables):
#   MODEL=claude-opus-5-5   PHASE_BUDGET=20 (USD per phase)   TOTAL_BUDGET=50 (USD for the night)
#   MAX_TURNS=400           PHASE_TIMEOUT=10800 (seconds per phase, 3 h)
#
# Morning: read docs/overnight/REPORT.md.

set -uo pipefail

# Keep the Mac awake for the whole run (re-launch under caffeinate once).
if [ -z "${OVERNIGHT_CAFFEINATED:-}" ] && command -v caffeinate >/dev/null 2>&1; then
  export OVERNIGHT_CAFFEINATED=1
  exec caffeinate -dimsu "$0" "$@"
fi

cd "$(dirname "$0")/.." || exit 1
APP_DIR="$(pwd)"

MODEL="${MODEL:-claude-opus-5-5}"
PHASE_BUDGET="${PHASE_BUDGET:-20}"
TOTAL_BUDGET="${TOTAL_BUDGET:-50}"
MAX_TURNS="${MAX_TURNS:-400}"
PHASE_TIMEOUT="${PHASE_TIMEOUT:-10800}"
if [ "$#" -gt 0 ]; then PHASES=("$@"); else PHASES=(2.8 4 4.2); fi

STAMP="$(date +%Y-%m-%d-%H%M)"
BRANCH="overnight/$STAMP"
OUT_DIR="docs/overnight"
LOG_DIR="$OUT_DIR/logs-$STAMP"
REPORT="$OUT_DIR/REPORT.md"
RULES="scripts/overnight-rules.md"
TOTAL_COST="0"

say()    { printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
die()    { say "STOPPED: $*"; notify "TaskFlow overnight stopped: $*"; exit 1; }
notify() { command -v osascript >/dev/null 2>&1 && osascript -e "display notification \"$1\" with title \"TaskFlow overnight\"" >/dev/null 2>&1 || true; }
report() { printf '%s\n' "$*" >> "$REPORT"; }
add()    { awk -v a="$1" -v b="$2" 'BEGIN { printf "%.2f", a + b }'; }
ge()     { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a >= b) }'; }

verify() {  # $1 = log file. Runs the four checks the phase must pass.
  {
    echo "== npm test";            CI=1 npm test            || return 1
    echo "== npm run typecheck";   npm run typecheck        || return 1
    echo "== npm run build";       npm run build            || return 1
    echo "== npm run test:schema"; npm run test:schema      || return 1
  } > "$1" 2>&1
}

# ---------- Preflight ----------
for cmd in claude node npm git perl awk; do
  command -v "$cmd" >/dev/null 2>&1 || die "'$cmd' is not installed or not on PATH"
done
[ -f "$RULES" ] || die "missing $RULES"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "taskflow/ is not a git repo"
[ -z "$(git status --porcelain)" ] || die "taskflow has uncommitted changes — commit them first (git add -A && git commit -m '...')"
for p in "${PHASES[@]}"; do
  grep -q "^### Phase $p —" docs/BUILD_PLAN.md || die "Phase $p is not in docs/BUILD_PLAN.md"
done

if [ -n "${ANTHROPIC_API_KEY:-}" ]; then BILLING="API credits (ANTHROPIC_API_KEY)"; else BILLING="Claude subscription login"; fi
say "Phases: ${PHASES[*]} | model: $MODEL | billing: $BILLING | caps: \$$PHASE_BUDGET/phase, \$$TOTAL_BUDGET total"

mkdir -p "$LOG_DIR"
say "Baseline check (tests, typecheck, build, schema) before starting…"
verify "$LOG_DIR/baseline.log" || die "baseline checks fail before any work — see $LOG_DIR/baseline.log"

git checkout -b "$BRANCH" >/dev/null 2>&1 || die "could not create branch $BRANCH"
START_COMMIT="$(git rev-parse HEAD)"

{
  echo "# Overnight run $STAMP"
  echo
  echo "- Branch: \`$BRANCH\` (from \`$START_COMMIT\`) — nothing was pushed"
  echo "- Phases requested: ${PHASES[*]}"
  echo "- Model: $MODEL · Billing: $BILLING · Caps: \$$PHASE_BUDGET per phase, \$$TOTAL_BUDGET total"
  echo "- Logs: \`$LOG_DIR/\`"
  echo
} > "$REPORT"

# ---------- Phases ----------
for P in "${PHASES[@]}"; do
  if ge "$TOTAL_COST" "$TOTAL_BUDGET"; then
    report "## Not started: Phase $P — the night's budget (\$$TOTAL_BUDGET) was used up"
    say "Budget used up; stopping before Phase $P."; break
  fi

  PHASE_REPORT="$OUT_DIR/phase-$P.md"
  JSON="$LOG_DIR/phase-$P.json"
  say "Phase $P — starting (fresh Claude Code session)…"
  T0=$(date +%s)

  PROMPT="Overnight unattended run. Do Phase $P of docs/BUILD_PLAN.md, following $RULES (already in your instructions). Write your plan to $PHASE_REPORT first, then build it, then finish the report. Do not ask questions."

  perl -e 'alarm shift; exec @ARGV' "$PHASE_TIMEOUT" \
    claude -p "$PROMPT" \
      --model "$MODEL" \
      --output-format json \
      --max-turns "$MAX_TURNS" \
      --max-budget-usd "$PHASE_BUDGET" \
      --append-system-prompt-file "$RULES" \
      --permission-mode dontAsk \
      --disallowedTools "Bash(git *)" "Bash(pkill *)" "Bash(killall *)" "Bash(kill *)" "Bash(rm -rf *)" \
        "Bash(supabase *)" "Bash(vercel *)" "Bash(netlify *)" "Bash(curl *)" "Bash(wget *)" \
        "Bash(npm run dev*)" "Bash(npm run preview*)" "Bash(npx vite*)" "Bash(npm publish*)" "mcp__supabase" \
      --allowedTools "Read" "Edit" "Write" "Glob" "Grep" \
        "Bash(npm *)" "Bash(npx *)" "Bash(node *)" "Bash(psql *)" "Bash(initdb *)" "Bash(pg_ctl *)" \
        "Bash(postgres *)" "Bash(createdb *)" "Bash(bash supabase/tests/*)" \
        "Bash(ls *)" "Bash(cat *)" "Bash(head *)" "Bash(tail *)" "Bash(wc *)" "Bash(grep *)" "Bash(find *)" \
        "Bash(mkdir *)" "Bash(cp *)" "Bash(mv *)" "Bash(diff *)" "Bash(sort *)" "Bash(echo *)" "Bash(pwd)" "Bash(which *)" "Bash(cd *)" "Bash(sed *)" "Bash(test *)" \
    > "$JSON" 2> "$LOG_DIR/phase-$P.stderr"
  RC=$?
  MINS=$(( ($(date +%s) - T0) / 60 ))

  COST=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(j.total_cost_usd??0))}catch{process.stdout.write("0")}' "$JSON")
  SUBTYPE=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(j.subtype??""))}catch{process.stdout.write("unreadable")}' "$JSON")
  TOTAL_COST=$(add "$TOTAL_COST" "$COST")

  STATUS="MISSING"
  [ -f "$PHASE_REPORT" ] && STATUS=$(grep -Eo 'STATUS: *(DONE|FAILED|BLOCKED)' "$PHASE_REPORT" | tail -1 | sed 's/STATUS: *//')
  [ -n "$STATUS" ] || STATUS="MISSING"

  say "Phase $P — Claude finished (exit $RC, $SUBTYPE, status $STATUS, \$$COST, ${MINS} min). Re-checking myself…"
  if verify "$LOG_DIR/phase-$P-verify.log"; then VERIFY="pass"; else VERIFY="FAIL"; fi

  {
    echo "## Phase $P — $STATUS"
    echo
    echo "- Claude exit code $RC (${SUBTYPE:-n/a}) · ${MINS} min · \$$COST (running total \$$TOTAL_COST)"
    echo "- Script re-check (test, typecheck, build, test:schema): **$VERIFY** — \`$LOG_DIR/phase-$P-verify.log\`"
    echo "- Claude's report: \`$PHASE_REPORT\`"
    echo
  } >> "$REPORT"

  git add -A
  if [ "$RC" -eq 0 ] && [ "$STATUS" = "DONE" ] && [ "$VERIFY" = "pass" ]; then
    git commit -q -m "Overnight: Phase $P (built unattended, pending your checks)" || true
    say "Phase $P committed on $BRANCH."
  else
    git commit -q -m "Overnight: Phase $P — INCOMPLETE ($STATUS, re-check $VERIFY), left for review" || true
    report "**Stopped here.** Later phases were not started."; report ""
    say "Phase $P did not finish cleanly — stopping the run."
    break
  fi
done

# ---------- Wrap-up ----------
{
  echo "## Morning checklist"
  echo
  echo "1. Read each phase report above (Decisions and Known issues first)."
  echo "2. Supabase → SQL Editor → paste the whole of \`supabase/taskflow_schema.sql\` → Run (once, covers every phase)."
  echo "3. \`npm run dev\`, then do each report's 'Check by hand' list on the Mac and a narrow browser."
  echo "4. Happy? \`git checkout main && git merge $BRANCH && git push\`."
  echo "   Not happy? Stay on main; the branch keeps everything for review (\`git diff main..$BRANCH\`)."
  echo "5. Root docs (../docs/DECISIONS.md, ../CLAUDE.md) may have changed — commit them in the PersonalOS repo."
  echo
  echo "Total spend this run: \$$TOTAL_COST"
} >> "$REPORT"
git add -A && git commit -q -m "Overnight: run report $STAMP" || true

say "Done. Total \$$TOTAL_COST. Report: $APP_DIR/$REPORT"
notify "Finished — total \$$TOTAL_COST. Open docs/overnight/REPORT.md"

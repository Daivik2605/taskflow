# TaskFlow — data contract

Contract views (`taskflow_dashboard_daily`, `taskflow_dashboard_now`, `taskflow_dashboard_area_daily`, `taskflow_dashboard_days_off`) are **coming in phase 11**. Nothing is published yet.

Planned shape: SPEC §11 and `../../docs/CONTRACT.md`. Rules once released: `security_invoker = true`, granted to `authenticated`, columns append-only.

## Shared calls
`taskflow_end_reset(p_app, p_detail, p_at)` arrives in phase 5; it will be documented here when it exists.

## Internal database objects (not for other apps)
`taskflow_merge_tag(p_from uuid, p_into uuid)` (security invoker, `authenticated` only) — moves everything from one tag to another and archives the source. `taskflow_log_activity(p_id uuid, p_preset uuid, p_minutes int, p_ended_at timestamptz)` (security invoker, `authenticated` only) — logs one activity-button tap as a stopped session with one segment; idempotent on `p_id`. `taskflow_areas` is the tag tree (`parent_id`, `show_for_tasks`; the `emoji` column is kept but no longer read or written; kinds `work · hustle · study · wellness · break · sleep · personal`); the views in phase 11 will group by it.

## Change log
- Phase 4.2: tables `taskflow_days` (one row per Toronto day: Top 3, plan note/energy, mood, energy, review note) and `taskflow_weeks` (one row per week: note, reviewed_at, ai_summary), column `taskflow_settings.shutdown_time` (HH:MM, default 21:00); both tables in realtime. Dropping a task in the shutdown sets the existing `taskflow_tasks.status = 'dropped'` (no new column). No views, nothing callable by other apps. `mood` / `energy` / `top3` may feed `taskflow_dashboard_*` in phase 4.5 (append-only then).
- Phase 2.8: table `taskflow_goals` (versioned: `series_id`, `starts_on`, `ends_on`; `metric` · `target_id` · `direction` · `amount` · `period` · `paused`), `taskflow_counters.reasons text[]`, `taskflow_counter_events.reason text`; `taskflow_goals` added to realtime. No views, nothing callable by other apps. The `goals_hit` / `goals_total` extras and `taskflow_dashboard_goals` stay planned for phase 4.5; they will read this table (judge each period on the version in force on its last elapsed day).
- Phase 2.7: `taskflow_counters.short_label`, `taskflow_presets.weekly_target` (presets are the Activities), `taskflow_areas.show_for_tasks`, function `taskflow_log_activity`, `taskflow_presets` added to realtime. No views, nothing callable by other apps.
- Phase 2.5: tag tree (`taskflow_areas.parent_id`, `emoji`, new kinds), task dates (`start_on`, `hard_deadline`, `estimate_minutes`), `taskflow_counters`, `taskflow_counter_events`, `taskflow_migration_log`, `taskflow_settings.week_starts_on`, function `taskflow_merge_tag`. Still no views and no function callable by other apps.- Phase 1: tables only (16 tables, 2 buckets) — see `supabase/taskflow_schema.sql`. No views, no functions callable by other apps.

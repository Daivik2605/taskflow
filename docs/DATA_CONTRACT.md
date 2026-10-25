# TaskFlow — data contract

Contract views (`taskflow_dashboard_daily`, `taskflow_dashboard_now`, `taskflow_dashboard_area_daily`, `taskflow_dashboard_days_off`) are **coming in phase 11**. Nothing is published yet.

Planned shape: SPEC §11 and `../../docs/CONTRACT.md`. Rules once released: `security_invoker = true`, granted to `authenticated`, columns append-only.

## Shared calls
`taskflow_end_reset(p_app, p_detail, p_at)` arrives in phase 5; it will be documented here when it exists.

## Internal database objects (not for other apps)
`taskflow_merge_tag(p_from uuid, p_into uuid)` (security invoker, `authenticated` only) — moves everything from one tag to another and archives the source. `taskflow_areas` is the tag tree (`parent_id`, `emoji`; kinds `work · hustle · study · wellness · break · sleep · personal`); the views in phase 11 will group by it.

## Change log
- Phase 2.5: tag tree (`taskflow_areas.parent_id`, `emoji`, new kinds), task dates (`start_on`, `hard_deadline`, `estimate_minutes`), `taskflow_counters`, `taskflow_counter_events`, `taskflow_migration_log`, `taskflow_settings.week_starts_on`, function `taskflow_merge_tag`. Still no views and no function callable by other apps.- Phase 1: tables only (16 tables, 2 buckets) — see `supabase/taskflow_schema.sql`. No views, no functions callable by other apps.

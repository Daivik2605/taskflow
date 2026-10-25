# TaskFlow — data contract

Contract views (`taskflow_dashboard_daily`, `taskflow_dashboard_now`, `taskflow_dashboard_area_daily`, `taskflow_dashboard_days_off`) are **coming in phase 11**. Nothing is published yet.

Planned shape: SPEC §11 and `../../docs/CONTRACT.md`. Rules once released: `security_invoker = true`, granted to `authenticated`, columns append-only.

## Shared calls
`taskflow_end_reset(p_app, p_detail, p_at)` arrives in phase 5; it will be documented here when it exists.

## Change log
- Phase 1: tables only (16 tables, 2 buckets) — see `supabase/taskflow_schema.sql`. No views, no functions callable by other apps.

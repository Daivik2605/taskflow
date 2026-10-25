-- Snapshot of the pre-migration state, kept in a scratch schema (not public) so the assertions can compare.
create schema tftest;
create table tftest.before_areas as select id, user_id, name, kind, archived from taskflow_areas;
create table tftest.before_tasks as select id, user_id, title, area_id, due_on, status, completed_at, parent_id, sort from taskflow_tasks;
create table tftest.before_counts as select user_id,
  (select count(*) from taskflow_tasks t where t.user_id = u.id) as tasks,
  (select count(*) from taskflow_presets t where t.user_id = u.id) as presets,
  (select count(*) from taskflow_projects t where t.user_id = u.id) as projects,
  (select count(*) from taskflow_sessions t where t.user_id = u.id) as sessions,
  (select count(*) from taskflow_notes t where t.user_id = u.id) as notes,
  (select count(*) from taskflow_areas t where t.user_id = u.id) as areas
  from (select id, id as user_id from auth.users) u;
create table tftest.before_presets as select id, user_id, name from taskflow_presets;

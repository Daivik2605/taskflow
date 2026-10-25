-- What the phase-1 app wrote on first sign-in (frozen copy of the old src/lib/seed.ts), for user :'uid'.
insert into taskflow_settings (user_id, seeded_at) values (:'uid', now());

insert into taskflow_areas (user_id, name, kind, app_key, color, sort) values
  (:'uid', 'DSA', 'focus', 'dsa', '#6366f1', 0),
  (:'uid', 'Trading', 'focus', 'trading', '#10b981', 1),
  (:'uid', 'SQL', 'focus', null, '#0ea5e9', 2),
  (:'uid', 'Tableau cert', 'focus', null, '#3b82f6', 3),
  (:'uid', 'Databricks cert', 'focus', null, '#ef4444', 4),
  (:'uid', 'AEO Studio', 'focus', null, '#8b5cf6', 5),
  (:'uid', 'Projects', 'focus', null, '#14b8a6', 6),
  (:'uid', 'Work — Tim Hortons', 'work', null, '#dc2626', 7),
  (:'uid', 'Wellbeing', 'wellbeing', null, '#22c55e', 8),
  (:'uid', 'Leisure', 'leisure', null, '#f59e0b', 9),
  (:'uid', 'People', 'social', null, '#ec4899', 10),
  (:'uid', 'Sleep', 'sleep', null, '#64748b', 11),
  (:'uid', 'Life admin', 'life', null, '#a3a3a3', 12);

insert into taskflow_presets (user_id, name, area_id, default_minutes, sort)
  select :'uid', 'Sudarshan Kriya', id, 35, 0 from taskflow_areas where user_id = :'uid' and name = 'Wellbeing';
insert into taskflow_presets (user_id, name, area_id, default_minutes, sort)
  select :'uid', 'Padmasadhna', id, 20, 1 from taskflow_areas where user_id = :'uid' and name = 'Wellbeing';

insert into taskflow_projects (user_id, name, area_id, status)
  select :'uid', 'AEO Studio', id, 'active' from taskflow_areas where user_id = :'uid' and name = 'AEO Studio';

insert into taskflow_jobs (user_id, employer, area_id)
  select :'uid', 'Tim Hortons', id from taskflow_areas where user_id = :'uid' and name = 'Work — Tim Hortons';

insert into taskflow_actions (user_id, key, label, sort)
  select :'uid', 'shift:' || id::text, 'Tim Hortons shift', 0 from taskflow_jobs where user_id = :'uid';
insert into taskflow_actions (user_id, key, label, sort) values (:'uid', 'nap_reset', 'Nap + reset', 1);
insert into taskflow_actions (user_id, key, label, sort)
  select :'uid', 'preset:' || id::text, name, 2 from taskflow_presets where user_id = :'uid' and name = 'Sudarshan Kriya';
insert into taskflow_actions (user_id, key, label, sort)
  select :'uid', 'preset:' || id::text, name, 3 from taskflow_presets where user_id = :'uid' and name = 'Padmasadhna';
insert into taskflow_actions (user_id, key, label, sort) values (:'uid', 'sleep_checkin', 'Sleep check-in', 4);

-- Sample work the user did in phases 1–2: tasks in several tags (incl. the ones being archived), a sub-task, an undated task,
-- a session and a note pointing at Leisure / Projects.
insert into taskflow_tasks (user_id, title, area_id, due_on, status, completed_at, sort)
  select :'uid', t.title, (select id from taskflow_areas where user_id = :'uid' and name = t.area), t.due::date, t.status,
         case when t.status = 'done' then '2026-10-24T15:00:00Z'::timestamptz end, t.sort
  from (values
    ('Study DSA graphs',      'DSA',                '2026-11-02', 'todo', 10),
    ('Plan the week',         'Projects',           '2026-11-03', 'todo', 20),
    ('PS5 night',             'Leisure',            null,         'todo', 30),
    ('Call Bini',             'People',             '2026-11-04', 'todo', 40),
    ('Pass G2',               'Life admin',         '2026-11-09', 'todo', 50),
    ('Finish AEO deck',       'AEO Studio',         '2026-11-06', 'todo', 60),
    ('Swap shift',            'Work — Tim Hortons', '2026-10-30', 'todo', 70),
    ('Read Tableau guide',    'Tableau cert',       null,         'todo', 80),
    ('Log sleep',             'Sleep',              '2026-10-25', 'done', 90),
    ('Sudarshan Kriya today', 'Wellbeing',          '2026-10-26', 'todo', 100),
    ('Old overdue thing',     'Trading',            '2026-10-01', 'todo', 110)
  ) as t(title, area, due, status, sort);
insert into taskflow_tasks (user_id, title, area_id, parent_id, sort)
  select :'uid', 'Book road test', area_id, id, 120 from taskflow_tasks where user_id = :'uid' and title = 'Pass G2';
insert into taskflow_tasks (user_id, title, sort) values (:'uid', 'No tag at all', 130);

insert into taskflow_sessions (user_id, area_id, started_at, ended_at, state)
  select :'uid', id, '2026-10-24T20:00:00Z', '2026-10-24T21:00:00Z', 'stopped' from taskflow_areas where user_id = :'uid' and name = 'Leisure';
insert into taskflow_notes (user_id, title, area_id)
  select :'uid', 'Idea for the Projects tag', id from taskflow_areas where user_id = :'uid' and name = 'Projects';

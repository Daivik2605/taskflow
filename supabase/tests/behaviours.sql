-- Behaviour of the revision-2 rules (tag tree, task dates, counter days, merge, RLS on the new tables).
-- Self-contained: creates its own two users, so it can run on a fresh database and on a migrated one.
\set ON_ERROR_STOP on
\set x '33333333-3333-3333-3333-333333333333'
\set y '44444444-4444-4444-4444-444444444444'
insert into auth.users (id) values (:'x'), (:'y');

set role authenticated;
select set_config('request.jwt.claim.sub', :'x', false) \g /dev/null

-- ── tag tree ──
do $$ declare study uuid; brk uuid; dsa uuid; k text; msg text; begin
  insert into taskflow_areas (name, kind) values ('Study', 'study') returning id into study;
  insert into taskflow_areas (name, kind) values ('Break', 'break') returning id into brk;
  insert into taskflow_areas (name, kind, parent_id) values ('DSA', 'break', study) returning id into dsa;
  select kind into k from taskflow_areas where id = dsa;
  if k <> 'study' then raise exception 'sub-tag did not inherit its parent kind: %', k; end if;

  begin insert into taskflow_areas (name, parent_id) values ('Graphs', dsa); raise exception 'third level was allowed';
  exception when others then get stacked diagnostics msg = message_text; if msg !~ 'two levels' then raise; end if; end;
  begin update taskflow_areas set parent_id = brk where id = study; raise exception 'a parent with sub-tags became a sub-tag';
  exception when others then get stacked diagnostics msg = message_text; if msg !~ 'sub-tags cannot become' and msg !~ 'cannot become a sub-tag' then raise; end if; end;
  begin update taskflow_areas set parent_id = id where id = brk; raise exception 'a tag became its own parent';
  exception when others then get stacked diagnostics msg = message_text; if msg !~ 'own parent' then raise; end if; end;

  insert into taskflow_areas (name, parent_id) values ('Misc', study);
  insert into taskflow_areas (name, parent_id) values ('Misc', brk);                     -- same name, different parents: fine
  begin insert into taskflow_areas (name, parent_id) values ('Misc', study); raise exception 'duplicate name under one parent allowed';
  exception when unique_violation then null; end;
  begin insert into taskflow_areas (name, kind) values ('Study', 'study'); raise exception 'duplicate top-level name allowed';
  exception when unique_violation then null; end;
  begin insert into taskflow_areas (name, kind) values ('Bad', 'focus'); raise exception 'old kind was allowed';
  exception when check_violation then null; end;

  update taskflow_areas set kind = 'hustle' where id = study;                            -- flows down
  select kind into k from taskflow_areas where id = dsa;
  if k <> 'hustle' then raise exception 'parent kind change did not cascade: %', k; end if;
  update taskflow_areas set kind = 'study' where id = study;

  update taskflow_areas set parent_id = brk where id = dsa;                              -- move: kind follows
  select kind into k from taskflow_areas where id = dsa;
  if k <> 'break' then raise exception 'moved sub-tag kept the old kind: %', k; end if;
  update taskflow_areas set parent_id = study where id = dsa;
end $$;

-- ON CONFLICT inference (what the app's seed upsert sends) works against the NULLS NOT DISTINCT key
do $$ declare n int; study uuid; begin
  select id into study from taskflow_areas where name = 'Study' and parent_id is null;
  insert into taskflow_areas (user_id, name, kind, parent_id) values (auth.uid(), 'Study', 'study', null)
    on conflict (user_id, parent_id, name) do nothing;
  insert into taskflow_areas (user_id, name, kind, parent_id) values (auth.uid(), 'DSA', 'study', study)
    on conflict (user_id, parent_id, name) do nothing;
  select count(*) into n from taskflow_areas where name = 'Study' and parent_id is null;
  if n <> 1 then raise exception 'upsert duplicated a top-level tag (% rows)', n; end if;
  select count(*) into n from taskflow_areas where name = 'DSA' and parent_id = study;
  if n <> 1 then raise exception 'upsert duplicated a sub-tag (% rows)', n; end if;
end $$;

-- ── task dates ──
do $$ declare tid uuid; begin
  insert into taskflow_tasks (title, due_on, start_on) values ('window', '2026-11-20', '2026-11-10') returning id into tid;
  insert into taskflow_tasks (title, due_on, hard_deadline, start_on) values ('deadline', '2026-11-09', true, null);
  begin insert into taskflow_tasks (title, due_on, start_on) values ('bad', '2026-11-01', '2026-11-02'); raise exception 'start after due allowed';
  exception when check_violation then null; end;
  begin insert into taskflow_tasks (title, hard_deadline) values ('bad', true); raise exception 'deadline without a date allowed';
  exception when check_violation then null; end;
  begin insert into taskflow_tasks (title, estimate_minutes) values ('bad', 0); raise exception 'zero estimate allowed';
  exception when check_violation then null; end;
  insert into taskflow_tasks (title, due_on, start_on) values ('one day', '2026-11-05', '2026-11-05');   -- start = due is fine
end $$;

-- ── counters: the day is always the Toronto day of `at`, including across DST ──
do $$ declare cid uuid; d date; begin
  insert into taskflow_counters (name, emoji) values ('Cigarette', '🚬') returning id into cid;
  insert into taskflow_counter_events (counter_id, at, day) values (cid, '2026-11-02T04:59:00Z', '1999-01-01') returning day into d;
  if d <> '2026-11-01' then raise exception '23:59 Toronto should be the 1st, got %', d; end if;
  insert into taskflow_counter_events (counter_id, at, day) values (cid, '2026-11-02T05:00:00Z', '1999-01-01') returning day into d;
  if d <> '2026-11-02' then raise exception 'midnight Toronto should be the 2nd, got %', d; end if;
  insert into taskflow_counter_events (counter_id, at) values (cid, '2026-11-01T05:30:00Z') returning day into d;
  if d <> '2026-11-01' then raise exception 'first 01:30 (EDT) should be the 1st, got %', d; end if;
  insert into taskflow_counter_events (counter_id, at) values (cid, '2026-11-01T06:30:00Z') returning day into d;
  if d <> '2026-11-01' then raise exception 'repeated 01:30 (EST) should be the 1st, got %', d; end if;
  insert into taskflow_counter_events (counter_id, at) values (cid, '2027-03-15T03:59:00Z') returning day into d;
  if d <> '2027-03-14' then raise exception '23:59 on the 23-hour day should be the 14th, got %', d; end if;
  update taskflow_counter_events set at = '2026-12-25T17:00:00Z' where at = '2026-11-02T05:00:00Z' returning day into d;
  if d <> '2026-12-25' then raise exception 'editing at did not move day, got %', d; end if;
  begin insert into taskflow_counter_events (counter_id, qty) values (cid, 0); raise exception 'qty 0 allowed';
  exception when check_violation then null; end;
  begin insert into taskflow_counters (name) values ('Cigarette'); raise exception 'duplicate counter name allowed';
  exception when unique_violation then null; end;
end $$;

-- ── merge ──
do $$ declare study uuid; a uuid; b uuid; kid uuid; tid uuid; n int; msg text; begin
  select id into study from taskflow_areas where name = 'Study' and parent_id is null;
  insert into taskflow_areas (name, parent_id) values ('MergeA', study) returning id into a;
  insert into taskflow_areas (name, parent_id) values ('MergeB', study) returning id into b;
  insert into taskflow_tasks (title, area_id) values ('moves', a) returning id into tid;
  insert into taskflow_presets (name, area_id, default_minutes) values ('p-merge', a, 10);
  insert into taskflow_sessions (area_id, started_at, ended_at, state) values (a, now() - interval '2 hours', now() - interval '1 hour', 'stopped');
  insert into taskflow_notes (title, area_id) values ('n-merge', a);
  perform taskflow_merge_tag(a, b);
  select count(*) into n from taskflow_tasks where area_id = b and title = 'moves';
  if n <> 1 then raise exception 'task did not move in merge'; end if;
  select count(*) into n from taskflow_areas where id = a and archived;
  if n <> 1 then raise exception 'merged tag was not archived'; end if;
  select count(*) into n from taskflow_presets where area_id = b and name = 'p-merge';
  if n <> 1 then raise exception 'preset did not move'; end if;
  select count(*) into n from taskflow_sessions where area_id = b;
  if n <> 1 then raise exception 'session did not move'; end if;
  select count(*) into n from taskflow_notes where area_id = b;
  if n <> 1 then raise exception 'note did not move'; end if;
  begin perform taskflow_merge_tag(study, b); raise exception 'merged a parent that still has sub-tags';
  exception when others then get stacked diagnostics msg = message_text; if msg !~ 'sub-tags first' then raise; end if; end;
  begin perform taskflow_merge_tag(b, a); raise exception 'merged into an archived tag';
  exception when others then get stacked diagnostics msg = message_text; if msg !~ 'archived' then raise; end if; end;
  begin perform taskflow_merge_tag(b, b); raise exception 'merged into itself';
  exception when others then get stacked diagnostics msg = message_text; if msg !~ 'itself' then raise; end if; end;
end $$;

-- ── another user can see and touch none of it, merge included ──
select set_config('request.jwt.claim.sub', :'y', false) \g /dev/null
do $$ declare t text; n int; total int := 0; some uuid; msg text; begin
  foreach t in array array['taskflow_areas','taskflow_tasks','taskflow_counters','taskflow_counter_events','taskflow_migration_log'] loop
    execute format('select count(*) from public.%I where user_id = %L', t, '33333333-3333-3333-3333-333333333333') into n;
    total := total + n;
  end loop;
  if total <> 0 then raise exception 'user y can see % of user x''s rows', total; end if;
  begin
    insert into taskflow_migration_log (user_id, migration, table_name, row_id, before)
    values ('33333333-3333-3333-3333-333333333333', 'x', 'x', gen_random_uuid(), '{}');
    raise exception 'user y wrote a migration-log row for user x';
  exception when insufficient_privilege then null; end;
  begin
    insert into taskflow_counter_events (user_id, counter_id) values ('33333333-3333-3333-3333-333333333333', gen_random_uuid());
    raise exception 'user y wrote a counter event for user x';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select (select id from taskflow_areas where user_id = :'x' and name = 'Study' and parent_id is null) as study_id,
       (select id from taskflow_areas where user_id = :'x' and name = 'Break' and parent_id is null) as break_id \gset
select set_config('tf.study', :'study_id', false), set_config('tf.break', :'break_id', false) \g /dev/null
set role authenticated;
select set_config('request.jwt.claim.sub', :'y', false) \g /dev/null
do $$ declare msg text; begin
  begin perform taskflow_merge_tag(current_setting('tf.study')::uuid, current_setting('tf.break')::uuid);
    raise exception 'user y merged user x''s tags';
  exception when others then get stacked diagnostics msg = message_text; if msg !~ 'not found' then raise; end if; end;
end $$;
reset role;

-- ── activities (phase 2.7): taskflow_log_activity is idempotent on the client id, atomic, and per-user ──
set role authenticated;
select set_config('request.jwt.claim.sub', :'x', false) \g /dev/null
do $$ declare tag uuid; pr uuid; sid uuid := gen_random_uuid(); r uuid; n int; s record; msg text; ended timestamptz := date_trunc('minute', now()) - interval '2 hours'; begin
  insert into taskflow_areas (name, kind) values ('ActTag', 'wellness') returning id into tag;
  insert into taskflow_presets (name, area_id, default_minutes, weekly_target) values ('ActGym', tag, 60, 3) returning id into pr;
  begin insert into taskflow_presets (name, area_id, default_minutes, weekly_target) values ('ActBad', tag, 10, 0); raise exception 'zero weekly target allowed';
  exception when check_violation then null; end;
  insert into taskflow_counters (name, short_label) values ('Alcohol', 'Alc');
  if (select short_label from taskflow_counters where name = 'Alcohol') <> 'Alc' then raise exception 'short_label not stored'; end if;

  r := taskflow_log_activity(sid, pr, 45, ended);
  if r <> sid then raise exception 'the function must return the client id'; end if;
  r := taskflow_log_activity(sid, pr, 45, ended);                 -- a retry
  r := taskflow_log_activity(sid, pr, 45, ended);
  select count(*) into n from taskflow_sessions where id = sid;
  if n <> 1 then raise exception 'a retry duplicated the session (%)', n; end if;
  select count(*) into n from taskflow_session_segments where session_id = sid;
  if n <> 1 then raise exception 'a retry duplicated the segment (%)', n; end if;
  select * into s from taskflow_sessions where id = sid;
  if s.state <> 'stopped' or s.source <> 'preset' or s.preset_id <> pr or s.area_id <> tag then raise exception 'wrong session row: %', s; end if;
  if s.ended_at <> ended or s.started_at <> ended - interval '45 minutes' then raise exception 'wrong times: % → %', s.started_at, s.ended_at; end if;
  if (select started_at || ended_at::text from taskflow_session_segments where session_id = sid) is distinct from (s.started_at || s.ended_at::text) then raise exception 'segment does not match its session'; end if;

  begin perform taskflow_log_activity(gen_random_uuid(), pr, 0); raise exception 'zero minutes allowed';
  exception when others then get stacked diagnostics msg = message_text; if msg !~ 'Minutes' then raise; end if; end;
  begin perform taskflow_log_activity(gen_random_uuid(), pr, 30, now() + interval '2 hours'); raise exception 'future log allowed';
  exception when others then get stacked diagnostics msg = message_text; if msg !~ 'future' then raise; end if; end;
  begin perform taskflow_log_activity(gen_random_uuid(), gen_random_uuid(), 30); raise exception 'unknown activity allowed';
  exception when others then get stacked diagnostics msg = message_text; if msg !~ 'not found' then raise; end if; end;

  delete from taskflow_sessions where id = sid;                                      -- Undo: the segment goes with it
  select count(*) into n from taskflow_session_segments where session_id = sid;
  if n <> 0 then raise exception 'deleting the session left its segment'; end if;
  perform set_config('tf.act_preset', pr::text, false);
  perform set_config('tf.act_session', taskflow_log_activity(gen_random_uuid(), pr, 20)::text, false);
end $$;
select set_config('request.jwt.claim.sub', :'y', false) \g /dev/null
do $$ declare msg text; n int; begin
  begin perform taskflow_log_activity(gen_random_uuid(), current_setting('tf.act_preset')::uuid, 20); raise exception 'user y logged on user x''s activity';
  exception when others then get stacked diagnostics msg = message_text; if msg !~ 'not found' then raise; end if; end;
  -- replaying x's session id as y must neither reveal nor overwrite it
  begin perform taskflow_log_activity(current_setting('tf.act_session')::uuid, current_setting('tf.act_preset')::uuid, 20); raise exception 'user y replayed x''s id';
  exception when others then get stacked diagnostics msg = message_text; if msg !~ 'not found' then raise; end if; end;
  select count(*) into n from taskflow_sessions where source = 'preset';
  if n <> 0 then raise exception 'user y can see user x''s activity sessions'; end if;
end $$;
reset role;
do $$ begin
  if (select prosecdef from pg_proc where proname = 'taskflow_log_activity') then raise exception 'taskflow_log_activity must be security invoker'; end if;
  if has_function_privilege('anon', 'public.taskflow_log_activity(uuid,uuid,int,timestamptz)', 'execute') then raise exception 'anon can execute taskflow_log_activity'; end if;
  if not has_function_privilege('authenticated', 'public.taskflow_log_activity(uuid,uuid,int,timestamptz)', 'execute') then raise exception 'authenticated cannot execute taskflow_log_activity'; end if;
end $$;

-- ── goals + reasons (phase 2.8) ──
set role authenticated;
select set_config('request.jwt.claim.sub', :'x', false) \g /dev/null
do $$ declare c uuid; g1 uuid := gen_random_uuid(); ser uuid; n int; begin
  insert into taskflow_counters (name, reasons) values ('GoalCtr', array['bored','stress']) returning id into c;
  if (select reasons from taskflow_counters where id = c) <> array['bored','stress'] then raise exception 'reasons not stored'; end if;
  insert into taskflow_counter_events (counter_id, qty, reason) values (c, 1, 'bored');
  if (select reason from taskflow_counter_events where counter_id = c) <> 'bored' then raise exception 'reason not stored'; end if;
  insert into taskflow_counter_events (counter_id, qty) values (c, 1);
  if (select count(*) from taskflow_counter_events where counter_id = c and reason is null) <> 1 then raise exception 'reason must be optional'; end if;

  insert into taskflow_goals (id, metric, target_id, direction, amount, period, starts_on) values (g1, 'counter_count', c, 'at_most', 5, 'day', '2026-11-01') returning series_id into ser;
  -- a new version shares the series; the old one ends the day before
  update taskflow_goals set ends_on = '2026-11-09' where id = g1;
  insert into taskflow_goals (series_id, metric, target_id, direction, amount, period, starts_on) values (ser, 'counter_count', c, 'at_most', 4, 'day', '2026-11-10');
  select count(*) into n from taskflow_goals where series_id = ser;
  if n <> 2 then raise exception 'versions not stored (%)', n; end if;
  begin insert into taskflow_goals (metric, target_id, direction, amount, period, starts_on) values ('counter_count', c, 'at_most', 0, 'day', '2026-11-01'); raise exception 'zero amount allowed';
  exception when check_violation then null; end;
  begin insert into taskflow_goals (metric, target_id, direction, amount, period, starts_on) values ('counter_count', c, 'sideways', 1, 'day', '2026-11-01'); raise exception 'bad direction allowed';
  exception when check_violation then null; end;
  begin insert into taskflow_goals (metric, target_id, direction, amount, period, starts_on, ends_on) values ('counter_count', c, 'at_most', 1, 'day', '2026-11-05', '2026-11-04'); raise exception 'ends before it starts';
  exception when check_violation then null; end;
  begin insert into taskflow_goals (metric, direction, amount, period, starts_on) values ('counter_count', 'at_most', 1, 'day', '2026-11-01'); raise exception 'counter goal without a target';
  exception when check_violation then null; end;
  begin insert into taskflow_goals (metric, target_id, direction, amount, period, starts_on) values ('tasks_done', c, 'at_least', 1, 'day', '2026-11-01'); raise exception 'tasks goal with a target';
  exception when check_violation then null; end;
  insert into taskflow_goals (metric, direction, amount, period, starts_on) values ('tasks_done', 'at_least', 3, 'day', '2026-11-01');
  perform set_config('tf.goal_series', ser::text, false);
end $$;
select set_config('request.jwt.claim.sub', :'y', false) \g /dev/null
do $$ begin
  if (select count(*) from taskflow_goals) <> 0 then raise exception 'user y can see user x''s goals'; end if;
  delete from taskflow_goals;
end $$;
select set_config('request.jwt.claim.sub', :'x', false) \g /dev/null
do $$ begin
  if (select count(*) from taskflow_goals where series_id = current_setting('tf.goal_series')::uuid) <> 2 then raise exception 'user y deleted user x''s goals'; end if;
  delete from taskflow_goals where series_id = current_setting('tf.goal_series')::uuid;   -- deleting a goal removes every version
  if (select count(*) from taskflow_goals where series_id = current_setting('tf.goal_series')::uuid) <> 0 then raise exception 'delete left versions'; end if;
end $$;
-- ── phase 4.2: days, weeks, shutdown time ──
select set_config('request.jwt.claim.sub', :'x', false) \g /dev/null
do $$ declare ids uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()]; begin
  insert into taskflow_days (day, top3, mood, energy, plan_energy) values ('2026-11-10', ids[1:3], 4, 3, 5);
  begin insert into taskflow_days (day) values ('2026-11-10'); raise exception 'second row for one day allowed';
  exception when unique_violation then null; end;
  begin insert into taskflow_days (day, top3) values ('2026-11-11', ids); raise exception 'four top tasks allowed';
  exception when check_violation then null; end;
  begin insert into taskflow_days (day, mood) values ('2026-11-12', 6); raise exception 'mood 6 allowed';
  exception when check_violation then null; end;
  insert into taskflow_weeks (week_start, note) values ('2026-11-02', 'ok');
  begin insert into taskflow_weeks (week_start) values ('2026-11-02'); raise exception 'second review for one week allowed';
  exception when unique_violation then null; end;
  insert into taskflow_settings default values on conflict (user_id) do nothing;
  update taskflow_settings set shutdown_time = '22:30' where true;
  begin update taskflow_settings set shutdown_time = '25:00' where true; raise exception 'bad shutdown time allowed';
  exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub', :'y', false) \g /dev/null
do $$ begin
  if (select count(*) from taskflow_days) + (select count(*) from taskflow_weeks) <> 0 then raise exception 'user y can see user x''s days or weeks'; end if;
  delete from taskflow_days; delete from taskflow_weeks;
end $$;
select set_config('request.jwt.claim.sub', :'x', false) \g /dev/null
do $$ begin
  if (select count(*) from taskflow_days) <> 1 or (select count(*) from taskflow_weeks) <> 1 then raise exception 'user y deleted user x''s days or weeks'; end if;
end $$;
reset role;

select 'BEHAVIOURS PASSED' as result;

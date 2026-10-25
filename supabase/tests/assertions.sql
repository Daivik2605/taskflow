-- Assertions run after the schema has been applied twice. Any failure raises and stops the run.
\set ON_ERROR_STOP on
\set u1 '11111111-1111-1111-1111-111111111111'
\set u2 '22222222-2222-2222-2222-222222222222'

insert into auth.users (id) values (:'u1'), (:'u2');

-- structure ---------------------------------------------------------------------------------
\i structure.sql

-- behaviour as user 1 ----------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :'u1', false);

insert into taskflow_areas (name, kind) values ('Personal', 'personal'), ('DSA', 'study');
insert into taskflow_projects (name, status) values ('AEO Studio', 'active');
update taskflow_projects set last_touched_at = now() - interval '90 days';

do $$ declare before timestamptz; after timestamptz; pid uuid; tid uuid; aid uuid; begin
  select id into pid from taskflow_projects;
  select id into aid from taskflow_areas where name = 'DSA';

  -- project touch via task
  select last_touched_at into before from taskflow_projects;
  insert into taskflow_tasks (title, project_id, due_on) values ('Pass G2', pid, '2026-11-09') returning id into tid;
  select last_touched_at into after from taskflow_projects;
  if after <= before then raise exception 'task insert did not touch project'; end if;

  -- project touch via note
  update taskflow_projects set last_touched_at = now() - interval '90 days';
  insert into taskflow_notes (title, project_id) values ('idea', pid);
  select last_touched_at into after from taskflow_projects;
  if after < now() - interval '1 minute' then raise exception 'note insert did not touch project'; end if;

  -- project touch via session (through its task)
  update taskflow_projects set last_touched_at = now() - interval '90 days';
  insert into taskflow_sessions (area_id, task_id, started_at) values (aid, tid, now());
  select last_touched_at into after from taskflow_projects;
  if after < now() - interval '1 minute' then raise exception 'session insert did not touch project'; end if;

  -- task with no project does not blow up
  insert into taskflow_tasks (title) values ('no project');

  -- updated_at moves on update
  update taskflow_tasks set updated_at = now() - interval '1 day' where id = tid;  -- trigger overrides to now()
  select updated_at into after from taskflow_tasks where id = tid;
  if after < now() - interval '1 minute' then raise exception 'updated_at trigger did not fire'; end if;
end $$;

-- one non-stopped session per user
do $$ declare aid uuid; begin
  select id into aid from taskflow_areas where name = 'DSA';
  begin
    insert into taskflow_sessions (area_id, started_at) values (aid, now());
    raise exception 'second active session was allowed';
  exception when unique_violation then null; end;
  update taskflow_sessions set state = 'stopped', ended_at = now();
  insert into taskflow_sessions (area_id, started_at) values (aid, now());  -- allowed once the first stopped
end $$;

-- one open reset per user
do $$ begin
  insert into taskflow_resets (started_at) values (now());
  begin
    insert into taskflow_resets (started_at) values (now());
    raise exception 'second open reset was allowed';
  exception when unique_violation then null; end;
  update taskflow_resets set ended_at = now(), ended_by = 'manual';
  insert into taskflow_resets (started_at) values (now());
end $$;

-- sleep minutes are generated; bad interval rejected
do $$ declare m int; begin
  insert into taskflow_sleep (day, bed_at, wake_at) values ('2026-10-24', '2026-10-23T23:30-04', '2026-10-24T07:15-04');
  select minutes into m from taskflow_sleep;
  if m <> 465 then raise exception 'sleep minutes % <> 465', m; end if;
  begin
    insert into taskflow_sleep (day, bed_at, wake_at) values ('2026-10-25', '2026-10-25T08:00-04', '2026-10-25T07:00-04');
    raise exception 'wake before bed was allowed';
  exception when check_violation then null; end;
end $$;

-- job with null rate/anchor; one open shift
do $$ declare jid uuid; aid uuid; begin
  insert into taskflow_areas (name, kind) values ('Tim Hortons', 'work') returning id into aid;
  insert into taskflow_jobs (employer, area_id) values ('Tim Hortons', aid) returning id into jid;
  if exists (select 1 from taskflow_jobs where hourly_rate is not null or pay_period_anchor is not null) then
    raise exception 'job rate/anchor should default to null';
  end if;
  insert into taskflow_shifts (job_id, day, clock_in_at) values (jid, '2026-10-24', now());
  begin
    insert into taskflow_shifts (job_id, day, clock_in_at) values (jid, '2026-10-24', now());
    raise exception 'second open shift was allowed';
  exception when unique_violation then null; end;
end $$;

-- settings: one row per user
do $$ begin
  insert into taskflow_settings default values;
  begin insert into taskflow_settings default values; raise exception 'second settings row allowed';
  exception when unique_violation then null; end;
end $$;

-- storage: own folder only
do $$ declare n int; begin
  insert into storage.objects (bucket_id, name) values ('taskflow-paystubs', '11111111-1111-1111-1111-111111111111/a.pdf');
  begin
    insert into storage.objects (bucket_id, name) values ('taskflow-paystubs', '22222222-2222-2222-2222-222222222222/a.pdf');
    raise exception 'wrote into another user''s folder';
  exception when insufficient_privilege then null; end;
end $$;

-- isolation: user 2 sees nothing of user 1, cannot write as user 1 -----------------------------
select set_config('request.jwt.claim.sub', :'u2', false);
do $$ declare t text; n int; total int := 0; begin
  foreach t in array array['taskflow_areas','taskflow_projects','taskflow_tasks','taskflow_notes','taskflow_sessions',
                           'taskflow_resets','taskflow_jobs','taskflow_shifts','taskflow_sleep','taskflow_settings'] loop
    execute format('select count(*) from public.%I', t) into n;
    total := total + n;
  end loop;
  if total <> 0 then raise exception 'user 2 can see % of user 1''s rows', total; end if;
  select count(*) into n from storage.objects;
  if n <> 0 then raise exception 'user 2 can see user 1''s files'; end if;
  begin
    insert into taskflow_areas (user_id, name) values ('11111111-1111-1111-1111-111111111111', 'sneaky');
    raise exception 'user 2 inserted a row for user 1';
  exception when insufficient_privilege then null; end;
  update taskflow_tasks set title = 'hacked';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'user 2 updated % rows of user 1', n; end if;
end $$;

-- anon has nothing ---------------------------------------------------------------------------
reset role;
set role anon;
do $$ begin
  begin perform 1 from taskflow_tasks; raise exception 'anon could read tasks';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select 'ALL ASSERTIONS PASSED' as result;

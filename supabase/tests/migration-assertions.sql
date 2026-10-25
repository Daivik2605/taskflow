-- Assertions on the phase-1 → revision-2 migration. User A = untouched phase-1 seed + sample work.
-- User B = the same plus tags the user made themselves (some colliding with the new tree).
\set ON_ERROR_STOP on
\set a '11111111-1111-1111-1111-111111111111'
\set b '22222222-2222-2222-2222-222222222222'
select set_config('tf.a', :'a', false), set_config('tf.b', :'b', false) \g /dev/null

\i structure.sql

-- nothing deleted --------------------------------------------------------------------------------
do $$ declare r record; n int; begin
  for r in select * from tftest.before_counts loop
    select count(*) into n from taskflow_tasks where user_id = r.user_id;    if n <> r.tasks    then raise exception 'tasks % -> % for %', r.tasks, n, r.user_id; end if;
    select count(*) into n from taskflow_presets where user_id = r.user_id;  if n < r.presets  then raise exception 'presets lost'; end if;
    select count(*) into n from taskflow_projects where user_id = r.user_id; if n <> r.projects then raise exception 'projects changed'; end if;
    select count(*) into n from taskflow_sessions where user_id = r.user_id; if n <> r.sessions then raise exception 'sessions changed'; end if;
    select count(*) into n from taskflow_notes where user_id = r.user_id;    if n <> r.notes    then raise exception 'notes changed'; end if;
    select count(*) into n from taskflow_areas where user_id = r.user_id;    if n < r.areas     then raise exception 'areas lost'; end if;
  end loop;
  -- every old tag id still exists
  select count(*) into n from tftest.before_areas b where not exists (select 1 from taskflow_areas a where a.id = b.id);
  if n <> 0 then raise exception '% old tag ids vanished', n; end if;
  -- every task still exists with its title, due date, status, completion and parent; none got a start date
  select count(*) into n from tftest.before_tasks b join taskflow_tasks t on t.id = b.id
   where t.title is distinct from b.title or t.due_on is distinct from b.due_on or t.status is distinct from b.status
      or t.completed_at is distinct from b.completed_at or t.parent_id is distinct from b.parent_id or t.sort is distinct from b.sort;
  if n <> 0 then raise exception '% tasks changed in ways they should not', n; end if;
  select count(*) into n from taskflow_tasks where start_on is not null or hard_deadline;
  if n <> 0 then raise exception 'migration must not give existing tasks a start date or deadline flag (% did)', n; end if;
  select count(*) into n from taskflow_tasks where status = 'done' and completed_at is null;
  if n <> 0 then raise exception 'done tasks lost their completion time'; end if;
end $$;

-- user A: the tree equals what a brand-new account is seeded with ---------------------------------
do $$ declare exp jsonb := current_setting('tf.expected')::jsonb; actual jsonb; u uuid := current_setting('tf.a')::uuid; begin
  select jsonb_agg(jsonb_build_object('name', p.name, 'kind', p.kind, 'show_for_tasks', p.show_for_tasks, 'children',
           coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'app_key', c.app_key, 'show_for_tasks', c.show_for_tasks) order by c.sort, c.name)
                     from taskflow_areas c where c.parent_id = p.id and not c.archived), '[]'::jsonb)) order by p.sort, p.name)
    into actual from taskflow_areas p where p.user_id = u and p.parent_id is null and not p.archived;
  if actual <> exp->'tree' then raise exception E'tree mismatch\nactual:   %\nexpected: %', actual, exp->'tree'; end if;

  if (select array_agg(name order by name) from taskflow_areas where user_id = u and archived) <> array['Leisure','People','Projects'] then
    raise exception 'archived tags should be exactly Leisure, People, Projects, got %', (select array_agg(name order by name) from taskflow_areas where user_id = u and archived);
  end if;
  -- sub-tags inherit kind
  if exists (select 1 from taskflow_areas c join taskflow_areas p on p.id = c.parent_id where c.kind <> p.kind) then raise exception 'sub-tag kind differs from parent'; end if;

  -- presets, jobs, counters, actions, project
  if (select jsonb_agg(jsonb_build_object('name', name, 'tag', tftest.tag_path(area_id), 'default_minutes', default_minutes) order by sort)
        from taskflow_presets where user_id = u) <> exp->'presets' then raise exception 'presets mismatch: %', (select jsonb_agg(jsonb_build_object('name', name, 'tag', tftest.tag_path(area_id), 'default_minutes', default_minutes) order by sort) from taskflow_presets where user_id = u); end if;
  if (select jsonb_agg(jsonb_build_object('employer', employer, 'tag', tftest.tag_path(area_id)) order by (employer <> 'Tim Hortons'))
        from taskflow_jobs where user_id = u) <> exp->'jobs' then raise exception 'jobs mismatch'; end if;
  if exists (select 1 from taskflow_jobs where user_id = u and (hourly_rate is not null or pay_period_anchor is not null)) then raise exception 'jobs must keep null rate and anchor'; end if;
  if (select jsonb_agg(jsonb_build_object('name', name, 'short_label', short_label) order by sort) from taskflow_counters where user_id = u) <> exp->'counters' then raise exception 'counters mismatch'; end if;
  if (select to_jsonb(array_agg(label order by sort)) from taskflow_actions where user_id = u) <> exp->'actions' then
    raise exception 'actions mismatch: %', (select array_agg(label order by sort) from taskflow_actions where user_id = u); end if;
  if (select jsonb_build_object('name', name, 'tag', tftest.tag_path(area_id)) from taskflow_projects where user_id = u) <> exp->'project' then raise exception 'project mismatch'; end if;
  -- the shift action keys point at real jobs, the preset action keys at real presets
  if (select count(*) from taskflow_actions a where a.user_id = u and a.key like 'shift:%'
        and not exists (select 1 from taskflow_jobs j where 'shift:' || j.id::text = a.key)) <> 0 then raise exception 'dangling shift action'; end if;
  if (select count(*) from taskflow_actions a where a.user_id = u and a.key like 'preset:%'
        and not exists (select 1 from taskflow_presets p where 'preset:' || p.id::text = a.key)) <> 0 then raise exception 'dangling preset action'; end if;
end $$;

-- user A: ids were kept (renamed / re-parented in place) -------------------------------------------
do $$ declare u uuid := current_setting('tf.a')::uuid; r record; begin
  for r in select * from (values
      ('DSA','Study/DSA'), ('Trading','Study/Trading'), ('SQL','Study/SQL'),
      ('Tableau cert','Study/Tableau Data Analyst Certification'), ('Databricks cert','Study/Databricks Data Analyst Certification'),
      ('AEO Studio','Hustle/AEO Studio'), ('Work — Tim Hortons','Work/Tim Hortons'),
      ('Wellbeing','Wellness'), ('Sleep','Sleep'), ('Life admin','Personal')) v(old_name, path) loop
    if (select tftest.tag_path(b.id) from tftest.before_areas b where b.user_id = u and b.name = r.old_name) is distinct from r.path then
      raise exception 'tag % should now be %, is %', r.old_name, r.path, (select tftest.tag_path(b.id) from tftest.before_areas b where b.user_id = u and b.name = r.old_name);
    end if;
  end loop;
  -- app keys survived
  if (select app_key from taskflow_areas where user_id = u and name = 'DSA') <> 'dsa' or (select app_key from taskflow_areas where user_id = u and name = 'Trading') <> 'trading' then
    raise exception 'app_key lost'; end if;
  -- presets kept their ids
  if (select count(*) from tftest.before_presets b join taskflow_presets p on p.id = b.id where b.user_id = u) <> 2 then raise exception 'preset ids changed'; end if;
end $$;

-- user A: every task, session, note, project, preset points at the right tag -------------------------
do $$ declare u uuid := current_setting('tf.a')::uuid; r record; got text; begin
  for r in select * from (values
      ('Study DSA graphs','Study/DSA'), ('Plan the week','Personal'), ('PS5 night','Break'), ('Call Bini','Break'),
      ('Pass G2','Personal'), ('Finish AEO deck','Hustle/AEO Studio'), ('Swap shift','Work/Tim Hortons'),
      ('Read Tableau guide','Study/Tableau Data Analyst Certification'), ('Log sleep','Sleep'), ('Sudarshan Kriya today','Wellness'),
      ('Old overdue thing','Study/Trading'), ('Book road test','Personal'), ('No tag at all', null)) v(title, path) loop
    select tftest.tag_path(area_id) into got from taskflow_tasks where user_id = u and title = r.title;
    if got is distinct from r.path then raise exception 'task "%" should be in %, is in %', r.title, r.path, got; end if;
  end loop;
  if (select tftest.tag_path(area_id) from taskflow_sessions where user_id = u) <> 'Break' then raise exception 'session did not follow Leisure → Break'; end if;
  if (select tftest.tag_path(area_id) from taskflow_notes where user_id = u) <> 'Personal' then raise exception 'note did not follow Projects → Personal'; end if;
  -- nothing references an archived tag any more (except by choice)
  if exists (select 1 from taskflow_tasks t join taskflow_areas a on a.id = t.area_id where t.user_id = u and a.archived) then raise exception 'a task still points at an archived tag'; end if;
end $$;

-- user B: custom tags are kept, mapped and merged without loss --------------------------------------
do $$ declare u uuid := current_setting('tf.b')::uuid; r record; got text; exp jsonb := current_setting('tf.expected')::jsonb; actual jsonb; begin
  for r in select * from (values
      ('Read a book','Reading'), ('Leg day','Wellness/Gym'), ('Tableau practice test','Study/Tableau Data Analyst Certification'),
      ('Read Tableau guide (B)','Study/Tableau Data Analyst Certification'), ('Read Tableau guide','Study/Tableau Data Analyst Certification'),
      ('Buy stamps','Errands'), ('Dinner with friends','Friends')) v(title, path) loop
    select tftest.tag_path(area_id) into got from taskflow_tasks where user_id = u and title = r.title;
    if got is distinct from r.path then raise exception 'B: task "%" should be in %, is in %', r.title, r.path, got; end if;
  end loop;
  if (select kind from taskflow_areas where user_id = u and name = 'Reading') <> 'study' then raise exception 'Reading kind'; end if;
  if (select kind from taskflow_areas where user_id = u and name = 'Errands') <> 'personal' then raise exception 'Errands kind'; end if;
  if (select kind from taskflow_areas where user_id = u and name = 'Friends') <> 'break' then raise exception 'Friends kind'; end if;
  if (select parent_id from taskflow_areas where user_id = u and name = 'Reading') is not null then raise exception 'custom tags stay top-level'; end if;
  -- the user's own "Gym" and "Tableau Data Analyst Certification" rows were reused (ids kept)
  if (select count(*) from tftest.before_areas b where b.user_id = u and b.name = 'Gym' and tftest.tag_path(b.id) = 'Wellness/Gym') <> 1 then raise exception 'custom Gym not reused'; end if;
  if (select count(*) from tftest.before_areas b where b.user_id = u and b.name = 'Tableau Data Analyst Certification' and tftest.tag_path(b.id) = 'Study/Tableau Data Analyst Certification') <> 1 then raise exception 'custom Tableau tag not reused'; end if;
  -- the old "Tableau cert" was merged into it and archived
  if not (select archived from taskflow_areas where user_id = u and name = 'Tableau cert') then raise exception 'Tableau cert should be archived after the merge'; end if;
  -- the seven standard parents and their sub-tags still equal the standard tree
  select jsonb_agg(jsonb_build_object('name', p.name, 'kind', p.kind, 'show_for_tasks', p.show_for_tasks, 'children',
           coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'app_key', c.app_key, 'show_for_tasks', c.show_for_tasks) order by c.sort, c.name)
                     from taskflow_areas c where c.parent_id = p.id and not c.archived), '[]'::jsonb)) order by p.sort, p.name)
    into actual from taskflow_areas p where p.user_id = u and p.parent_id is null and not p.archived
      and p.name in ('Work','Hustle','Study','Wellness','Break','Sleep','Personal');
  if actual <> exp->'tree' then raise exception E'B tree mismatch\nactual:   %\nexpected: %', actual, exp->'tree'; end if;
end $$;

-- the log: before-images exist, and re-runs add nothing --------------------------------------------
do $$ declare n int; m int; begin
  select count(*) into n from taskflow_migration_log where migration = 'phase-2.5' and table_name = 'taskflow_areas';
  select count(*) into m from tftest.before_areas;
  if n <> m then raise exception 'expected % logged areas, found %', m, n; end if;
  if not exists (select 1 from taskflow_migration_log where table_name = 'taskflow_tasks') then raise exception 'moved tasks were not logged'; end if;
  if (select count(*) from taskflow_migration_log) <> (select log_rows from tftest.log_after_first) then raise exception 'a re-run of the schema wrote more log rows'; end if;
  -- a log row's before-image is enough to restore the old name and kind
  if (select before->>'kind' from taskflow_migration_log l where table_name = 'taskflow_areas'
        and row_id = (select id from tftest.before_areas where name = 'Wellbeing' and user_id = current_setting('tf.a')::uuid) and user_id = current_setting('tf.a')::uuid) <> 'wellbeing' then
    raise exception 'log lost the old kind'; end if;
end $$;

select 'MIGRATION ASSERTIONS PASSED' as result;

-- Structure checks shared by the fresh-install and migrated databases (checks.sql 1–5 and 8 equivalents, plus realtime).
do $$ declare n int; begin
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and c.relname like 'taskflow\_%';
  if n <> 20 then raise exception 'expected 20 taskflow tables, found %', n; end if;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind in ('r','v') and c.relname !~ '^taskflow_';
  if n <> 0 then raise exception 'objects without prefix: %', n; end if;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if n <> 0 then raise exception 'tables without RLS: %', n; end if;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r'
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.policyname = 'own rows');
  if n <> 0 then raise exception 'tables without "own rows" policy: %', n; end if;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r'
     and not exists (select 1 from information_schema.columns i where i.table_schema = 'public' and i.table_name = c.relname and i.column_name = 'user_id');
  if n <> 0 then raise exception 'tables without user_id: %', n; end if;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'v';
  if n <> 0 then raise exception 'unexpected views: %', n; end if;
  select count(*) into n from storage.buckets where id !~ '^taskflow-';
  if n <> 0 then raise exception 'buckets without prefix: %', n; end if;
  select count(*) into n from storage.buckets where id in ('taskflow-paystubs','taskflow-timecards') and not public;
  if n <> 2 then raise exception 'expected 2 private taskflow buckets, found %', n; end if;
  select count(*) into n from pg_trigger where tgname = 'taskflow_set_updated_at';
  if n <> 19 then raise exception 'expected 19 updated_at triggers, found %', n; end if;
  select count(*) into n from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
     and tablename in ('taskflow_tasks','taskflow_sessions','taskflow_session_segments','taskflow_resets',
                       'taskflow_shifts','taskflow_shift_breaks','taskflow_notes','taskflow_counters','taskflow_counter_events','taskflow_presets','taskflow_goals');
  if n <> 11 then raise exception 'expected 11 tables in realtime publication, found %', n; end if;
  select count(*) into n from pg_publication_tables where pubname = 'supabase_realtime';
  if n <> 11 then raise exception 'publication holds % tables, expected 11', n; end if;
  select count(*) into n from information_schema.columns where table_name = 'taskflow_jobs'
     and column_name in ('hourly_rate','pay_period_anchor') and is_nullable = 'YES';
  if n <> 2 then raise exception 'hourly_rate and pay_period_anchor must be nullable'; end if;
  -- merge function is security invoker and not callable by anon
  if (select prosecdef from pg_proc where proname = 'taskflow_merge_tag') then raise exception 'taskflow_merge_tag must be security invoker'; end if;
  if has_function_privilege('anon', 'public.taskflow_merge_tag(uuid,uuid)', 'execute') then raise exception 'anon can execute taskflow_merge_tag'; end if;
  -- old kind check gone, new one and the per-parent unique key present
  if exists (select 1 from pg_constraint where conname = 'taskflow_areas_kind_check') then raise exception 'old kind check still present'; end if;
  if not exists (select 1 from pg_constraint where conname = 'taskflow_areas_kind_v2') then raise exception 'new kind check missing'; end if;
  if not exists (select 1 from pg_constraint where conname = 'taskflow_areas_parent_name_key') then raise exception 'per-parent unique key missing'; end if;
  if exists (select 1 from pg_constraint where conname = 'taskflow_areas_user_id_name_key') then raise exception 'old unique key still present'; end if;
end $$;

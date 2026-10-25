-- Helper for the assertions; created after the migration because it reads parent_id.
create function tftest.tag_path(p_id uuid) returns text language sql stable as $$
  select case when a.parent_id is null then a.name else (select name from taskflow_areas where id = a.parent_id) || '/' || a.name end
  from taskflow_areas a where a.id = p_id
$$;

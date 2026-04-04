-- Clinical module smoke tests (run after migrations)
-- Usage:
--   supabase db reset
--   supabase db query --file supabase/tests/clinical_module_smoke.sql

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_namespace
  where nspname = 'clinical';
  if v_count <> 1 then
    raise exception 'clinical schema missing';
  end if;
end $$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'clinical'
    and c.relkind = 'r'
    and c.relrowsecurity = true;
  if v_count < 17 then
    raise exception 'expected row level security enabled on clinical tables';
  end if;
end $$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname = 'clinical'
    and policyname = 'service_all';
  if v_count < 17 then
    raise exception 'expected service_all policies on clinical tables';
  end if;
end $$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname = 'clinical'
    and policyname in ('owner_select', 'owner_insert', 'owner_update', 'owner_delete');
  if v_count <> 0 then
    raise exception 'owner policies should not exist on clinical tables';
  end if;
end $$;

do $$
declare
  v_public boolean;
begin
  select public into v_public
  from storage.buckets
  where id = 'clinical-attachments-private';
  if v_public is distinct from false then
    raise exception 'clinical-attachments-private bucket must be private';
  end if;
end $$;

do $$
declare
  v_public boolean;
begin
  select public into v_public
  from storage.buckets
  where id = 'clinical-exports-private';
  if v_public is distinct from false then
    raise exception 'clinical-exports-private bucket must be private';
  end if;
end $$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'sessions'
    and t.tgname = 'trg_sessions_sanitize_legacy_clinical_fields'
    and not t.tgisinternal;
  if v_count <> 1 then
    raise exception 'expected sessions sanitization trigger';
  end if;
end $$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'patients'
    and t.tgname = 'trg_patients_sanitize_legacy_clinical_fields'
    and not t.tgisinternal;
  if v_count <> 1 then
    raise exception 'expected patients sanitization trigger';
  end if;
end $$;

select 'clinical_module_smoke_ok' as result;

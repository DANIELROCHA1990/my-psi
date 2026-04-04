-- Expose clinical schema to PostgREST so edge functions can use supabase-js .schema(''clinical'').
do $$
declare
  current_schemas text;
  normalized text;
  next_schemas text;
begin
  current_schemas := current_setting('pgrst.db_schemas', true);

  if current_schemas is null or btrim(current_schemas) = '' then
    next_schemas := 'public,graphql_public,clinical';
  else
    normalized := replace(current_schemas, ' ', '');
    if normalized ~ '(^|,)clinical($|,)' then
      return;
    end if;
    next_schemas := current_schemas || ',clinical';
  end if;

  execute format('alter role authenticator set pgrst.db_schemas = %L', next_schemas);
  perform pg_notify('pgrst', 'reload config');
end;
$$;
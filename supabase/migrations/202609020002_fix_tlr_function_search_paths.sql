do $$
declare
  function_signature regprocedure;
begin
  for function_signature in
    select procedure.oid::regprocedure
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname like 'tlr_%'
  loop
    execute format('alter function %s set search_path = public', function_signature);
  end loop;
end;
$$;

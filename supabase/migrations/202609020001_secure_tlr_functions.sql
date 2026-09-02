do $$
declare
  function_signature regprocedure;
begin
  for function_signature in
    select procedure.oid::regprocedure
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prosecdef = true
      and procedure.proname like 'tlr_%'
  loop
    execute format('alter function %s set search_path = public', function_signature);
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      function_signature
    );
    execute format('grant execute on function %s to service_role', function_signature);
  end loop;
end;
$$;

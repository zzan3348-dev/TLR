begin;

-- The backend secret key assumes the service_role Postgres role. RLS bypass
-- does not itself grant table privileges on a fresh project, so explicitly
-- grant the server role access to the canonical public schema objects.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Keep the backend usable when later migrations add public objects.
alter default privileges for role postgres in schema public
  grant all privileges on tables to service_role;
alter default privileges for role postgres in schema public
  grant all privileges on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

commit;

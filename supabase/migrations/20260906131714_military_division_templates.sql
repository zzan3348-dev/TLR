alter table public.military_templates add column if not exists country_key text;
alter table public.military_templates add column if not exists battalion_slots jsonb;
alter table public.military_templates add column if not exists support_slots jsonb;
alter table public.military_templates add column if not exists version integer not null default 1;
create table public.military_battalion_definitions (
  id uuid primary key default gen_random_uuid(), display_name text not null,
  category text not null check(category in ('LINE','SUPPORT')),
  icon_path text, manpower_required integer check(manpower_required >= 0),
  production_capacity_required numeric check(production_capacity_required >= 0),
  formation_days integer check(formation_days > 0), upkeep numeric check(upkeep >= 0),
  active boolean not null default true
);
alter table public.military_battalion_definitions enable row level security;
revoke all on public.military_battalion_definitions from anon,authenticated;
grant all on public.military_battalion_definitions to service_role;
create index military_templates_country_idx on public.military_templates(country_key);

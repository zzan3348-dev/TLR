create table if not exists public.map_capitals (
  country_key text primary key check (country_key ~ '^country-[0-9]{3}$'),
  name text not null check (length(name) between 1 and 80),
  map_x double precision,
  map_y double precision,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint map_capitals_x_range check (map_x is null or map_x between 0 and 5616),
  constraint map_capitals_y_range check (map_y is null or map_y between 0 and 2160)
);

alter table public.map_capitals enable row level security;

drop policy if exists map_capitals_public_read on public.map_capitals;
create policy map_capitals_public_read
  on public.map_capitals for select
  using (enabled = true);

grant select on public.map_capitals to anon, authenticated;
grant all on public.map_capitals to service_role;

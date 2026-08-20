create table if not exists public.province_regions (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  name text not null check (length(name) between 1 and 100),
  province_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(province_ids) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.province_regions enable row level security;
revoke all on public.province_regions from anon, authenticated;
grant all on public.province_regions to service_role;

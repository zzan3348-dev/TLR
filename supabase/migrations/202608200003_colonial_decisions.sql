create table if not exists public.country_colonial_decision_states (
  country_key text primary key,
  category_key text not null,
  policy_levels jsonb not null default '{}'::jsonb,
  admin_network_level integer not null default 0 check (admin_network_level between 0 and 3),
  relief_frozen boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.country_colonial_decision_states enable row level security;

alter table public.country_decision_modifiers
  drop constraint if exists country_decision_modifiers_unit_check;

alter table public.country_decision_modifiers
  add constraint country_decision_modifiers_unit_check
  check (unit in ('percentage_point', 'relative_percent', 'stage'));


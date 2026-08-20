create table if not exists public.country_decision_states (
  country_key text primary key,
  political_power numeric,
  political_power_gain_modifier numeric not null default 0,
  stability numeric,
  war_support numeric,
  poverty_rate numeric,
  living_standard_stage integer,
  living_standard_max_stage integer,
  updated_at timestamptz not null default now()
);

create table if not exists public.country_decision_party_support (
  country_key text not null,
  party_id text not null,
  support numeric not null check (support >= 0 and support <= 100),
  updated_at timestamptz not null default now(),
  primary key (country_key, party_id)
);

create table if not exists public.country_decision_executions (
  id uuid primary key default gen_random_uuid(),
  country_key text not null,
  decision_id text not null,
  target_party_id text,
  started_turn integer not null,
  cooldown_until_turn integer not null,
  temporary_until_turn integer,
  effects jsonb not null default '[]'::jsonb,
  executed_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists country_decision_executions_active_idx
  on public.country_decision_executions (country_key, decision_id, cooldown_until_turn desc);

create table if not exists public.country_decision_modifiers (
  country_key text not null,
  decision_id text not null,
  effect_key text not null,
  value numeric not null,
  unit text not null check (unit in ('percentage_point', 'relative_percent')),
  started_turn integer not null,
  expires_turn integer not null,
  primary key (country_key, decision_id, effect_key)
);

alter table public.country_decision_states enable row level security;
alter table public.country_decision_party_support enable row level security;
alter table public.country_decision_executions enable row level security;
alter table public.country_decision_modifiers enable row level security;

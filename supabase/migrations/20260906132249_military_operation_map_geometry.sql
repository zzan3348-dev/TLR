alter table public.military_actions add column if not exists plan_kind text check(plan_kind in ('OFFENSIVE','DEFENSIVE','OBJECTIVE','WITHDRAWAL','AMPHIBIOUS'));
alter table public.military_actions add column if not exists plan_geometry jsonb not null default '[]'::jsonb;

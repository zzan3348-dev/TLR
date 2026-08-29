begin;

alter table public.country_decision_states
  add column if not exists base_political_power numeric,
  add column if not exists political_power_per_turn numeric,
  add column if not exists base_stability numeric,
  add column if not exists base_war_support numeric,
  add column if not exists last_political_power_turn integer;

alter table public.country_military_resources
  add column if not exists base_available_manpower integer
    check (base_available_manpower is null or base_available_manpower >= 0);

create temporary table tlr_country_base_stats (
  country_key text primary key,
  base_political_power numeric not null,
  political_power_per_turn numeric not null,
  base_stability numeric not null,
  base_war_support numeric not null,
  base_available_manpower integer not null
) on commit drop;

insert into tlr_country_base_stats values
  ('country-001',300,200,100,60,3200000),
  ('country-002',300,200,100,60,1450000),
  ('country-003',300,200,100,60,3600000),
  ('country-004',300,200,100,60,1650000),
  ('country-005',300,200,100,60,520000),
  ('country-006',300,200,100,60,210000),
  ('country-007',300,200,100,60,850000),
  ('country-008',300,200,100,60,1650000),
  ('country-009',300,200,100,60,230000),
  ('country-010',300,200,100,60,320000),
  ('country-011',300,200,100,60,360000),
  ('country-012',300,200,100,60,5200000),
  ('country-013',300,200,100,60,1350000),
  ('country-014',300,200,100,60,1100000),
  ('country-015',300,200,100,60,65000),
  ('country-016',300,200,100,60,240000),
  ('country-017',300,200,100,60,270000),
  ('country-018',300,200,100,60,1850000),
  ('country-019',300,200,100,60,310000),
  ('country-020',300,200,100,60,160000),
  ('country-021',300,200,100,60,220000),
  ('country-022',300,200,100,60,500000),
  ('country-023',300,200,100,60,145000),
  ('country-024',300,200,100,60,1250000),
  ('country-025',300,200,100,60,760000),
  ('country-026',300,200,100,60,330000),
  ('country-027',300,200,100,60,430000),
  ('country-028',300,200,100,60,900000),
  ('country-029',300,200,100,60,1000000),
  ('country-030',300,200,100,60,180000),
  ('country-031',300,200,100,60,1300000),
  ('country-032',300,200,100,60,620000),
  ('country-033',300,200,100,60,780000),
  ('country-034',300,200,100,60,1350000),
  ('country-035',300,200,100,60,90000),
  ('country-036',300,200,100,60,520000),
  ('country-037',300,200,100,60,260000),
  ('country-038',300,200,100,60,1700000),
  ('country-039',300,200,100,60,900000),
  ('country-040',300,200,100,60,150000),
  ('country-041',300,200,100,60,185000),
  ('country-042',300,200,100,60,2650000),
  ('country-043',300,200,100,60,520000),
  ('country-044',300,200,100,60,240000),
  ('country-045',300,200,100,60,850000),
  ('country-046',300,200,100,60,520000),
  ('country-047',300,200,100,60,390000),
  ('country-048',300,200,100,60,520000),
  ('country-049',300,200,100,60,1450000),
  ('country-050',300,200,100,60,150000),
  ('country-051',300,200,100,60,380000),
  ('country-052',300,200,100,60,360000),
  ('country-053',300,200,100,60,1750000),
  ('country-054',300,200,100,60,150000),
  ('country-055',300,200,100,60,360000),
  ('country-056',300,200,100,60,460000),
  ('country-057',300,200,100,60,330000),
  ('country-058',300,200,100,60,5500000),
  ('country-059',300,200,100,60,420000),
  ('country-060',300,200,100,60,240000),
  ('country-061',300,200,100,60,310000),
  ('country-062',300,200,100,60,60000);

insert into public.country_decision_states (
  country_key,
  political_power,
  political_power_gain_modifier,
  stability,
  war_support,
  base_political_power,
  political_power_per_turn,
  base_stability,
  base_war_support
)
select
  country_key,
  base_political_power,
  0,
  base_stability,
  base_war_support,
  base_political_power,
  political_power_per_turn,
  base_stability,
  base_war_support
from tlr_country_base_stats
on conflict (country_key) do update set
  political_power = coalesce(country_decision_states.political_power, excluded.base_political_power),
  stability = coalesce(country_decision_states.stability, excluded.base_stability),
  war_support = coalesce(country_decision_states.war_support, excluded.base_war_support),
  base_political_power = excluded.base_political_power,
  political_power_per_turn = excluded.political_power_per_turn,
  base_stability = excluded.base_stability,
  base_war_support = excluded.base_war_support,
  updated_at = now();

insert into public.country_military_resources (
  country_key,
  available_manpower,
  base_available_manpower
)
select country_key, base_available_manpower, base_available_manpower
from tlr_country_base_stats
on conflict (country_key) do update set
  available_manpower = coalesce(country_military_resources.available_manpower, excluded.base_available_manpower),
  base_available_manpower = excluded.base_available_manpower,
  updated_at = now();

update public.country_decision_states
set last_political_power_turn = greatest(
  0,
  floor(
    ((select current_world_date from public.world_state where singleton = true) - date '1932-01-01')::numeric / 30
  )::integer
)
where last_political_power_turn is null;

create or replace function public.tlr_advance_country_stats(p_world_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turn integer := greatest(0, floor((p_world_date - date '1932-01-01')::numeric / 30)::integer);
begin
  update public.country_decision_states
  set
    political_power = greatest(
      0,
      coalesce(political_power, base_political_power, 0)
        + greatest(0, v_turn - coalesce(last_political_power_turn, v_turn))
          * coalesce(political_power_per_turn, 0)
          * greatest(0, 1 + coalesce(political_power_gain_modifier, 0) / 100)
    ),
    last_political_power_turn = v_turn,
    updated_at = now()
  where coalesce(last_political_power_turn, v_turn) < v_turn;
end;
$$;

revoke execute on function public.tlr_advance_country_stats(date) from public, anon, authenticated;
grant execute on function public.tlr_advance_country_stats(date) to service_role;

commit;

begin;

create table if not exists public.event_definitions (
  id text primary key,
  template_type text not null check (template_type in ('document','newspaper','super')),
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_choices (
  event_id text not null references public.event_definitions(id) on delete cascade,
  choice_id text not null,
  text text not null,
  description text,
  effects jsonb not null default '[]'::jsonb check (jsonb_typeof(effects) = 'array'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id,choice_id)
);

create table if not exists public.country_active_national_spirits (
  country_key text not null references public.countries(country_key) on delete cascade,
  spirit_id text not null,
  applied_world_date date not null,
  expires_world_date date,
  source_event_instance_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (country_key,spirit_id),
  check (expires_world_date is null or expires_world_date > applied_world_date)
);

create table if not exists public.event_choice_executions (
  event_instance_id text primary key,
  event_id text not null references public.event_definitions(id),
  choice_id text not null,
  actor_country_key text not null references public.countries(country_key),
  effects jsonb not null default '[]'::jsonb,
  executed_by uuid references public.profiles(id) on delete set null,
  world_date date not null,
  created_at timestamptz not null default now(),
  foreign key (event_id,choice_id) references public.event_choices(event_id,choice_id)
);

create index if not exists country_active_national_spirits_expiry_idx
  on public.country_active_national_spirits(expires_world_date)
  where expires_world_date is not null;
create index if not exists event_choice_executions_event_idx
  on public.event_choice_executions(event_id,choice_id,created_at desc);

alter table public.event_definitions enable row level security;
alter table public.event_choices enable row level security;
alter table public.country_active_national_spirits enable row level security;
alter table public.event_choice_executions enable row level security;

create or replace function public.tlr_apply_event_choice(
  p_event_instance_id text,
  p_event_id text,
  p_choice_id text,
  p_actor_country text,
  p_effects jsonb,
  p_world_date date,
  p_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effect jsonb;
  v_target text;
  v_type text;
  v_stat text;
  v_amount numeric;
  v_duration integer;
  v_spirit text;
  v_inserted integer;
begin
  if p_event_instance_id is null or p_event_id is null or p_choice_id is null
     or jsonb_typeof(p_effects) <> 'array' then
    raise exception 'INVALID_EVENT_EXECUTION';
  end if;

  insert into public.event_choice_executions (
    event_instance_id,event_id,choice_id,actor_country_key,effects,executed_by,world_date
  ) values (
    p_event_instance_id,p_event_id,p_choice_id,p_actor_country,p_effects,p_user_id,p_world_date
  ) on conflict (event_instance_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('applied',false,'duplicate',true);
  end if;

  for v_effect in select value from jsonb_array_elements(p_effects)
  loop
    v_type := v_effect->>'type';
    if jsonb_typeof(v_effect->'targetCountryIds') <> 'array' then
      raise exception 'EVENT_EFFECT_TARGET_REQUIRED';
    end if;
    for v_target in select jsonb_array_elements_text(v_effect->'targetCountryIds')
    loop
      if not exists (select 1 from public.countries where country_key=v_target and active) then
        raise exception 'UNKNOWN_EVENT_EFFECT_COUNTRY:%', v_target;
      end if;
      if v_type = 'modify_country_value' then
        v_stat := v_effect->>'statKey';
        v_amount := (v_effect->>'amount')::numeric;
        if v_stat = 'stability' then
          insert into public.country_decision_states(country_key,stability) values(v_target,greatest(0,least(100,v_amount)))
          on conflict(country_key) do update set stability=greatest(0,least(100,coalesce(country_decision_states.stability,0)+v_amount)),updated_at=now();
        elsif v_stat = 'warSupport' then
          insert into public.country_decision_states(country_key,war_support) values(v_target,greatest(0,least(100,v_amount)))
          on conflict(country_key) do update set war_support=greatest(0,least(100,coalesce(country_decision_states.war_support,0)+v_amount)),updated_at=now();
        elsif v_stat = 'politicalPower' then
          insert into public.country_decision_states(country_key,political_power) values(v_target,greatest(0,v_amount))
          on conflict(country_key) do update set political_power=greatest(0,coalesce(country_decision_states.political_power,0)+v_amount),updated_at=now();
        elsif v_stat = 'povertyRate' then
          insert into public.country_decision_states(country_key,poverty_rate) values(v_target,greatest(0,least(100,v_amount)))
          on conflict(country_key) do update set poverty_rate=greatest(0,least(100,coalesce(country_decision_states.poverty_rate,0)+v_amount)),updated_at=now();
        elsif v_stat = 'productionCapacity' then
          insert into public.country_economies(country_key,base_production_capacity) values(v_target,greatest(0,v_amount))
          on conflict(country_key) do update set base_production_capacity=greatest(0,coalesce(country_economies.base_production_capacity,0)+v_amount),updated_at=now();
        elsif v_stat = 'nationalIncome' then
          insert into public.country_economies(country_key,national_income) values(v_target,greatest(0,v_amount))
          on conflict(country_key) do update set national_income=greatest(0,coalesce(country_economies.national_income,0)+v_amount),updated_at=now();
        elsif v_stat = 'foreignReserves' then
          insert into public.country_economies(country_key,foreign_reserves) values(v_target,greatest(0,v_amount))
          on conflict(country_key) do update set foreign_reserves=greatest(0,coalesce(country_economies.foreign_reserves,0)+v_amount),updated_at=now();
        elsif v_stat = 'researchPower' then
          insert into public.country_economies(country_key,research_points) values(v_target,greatest(0,v_amount))
          on conflict(country_key) do update set research_points=greatest(0,coalesce(country_economies.research_points,0)+v_amount),updated_at=now();
        else
          raise exception 'UNSUPPORTED_COUNTRY_STAT:%', v_stat;
        end if;
      elsif v_type = 'add_national_spirit' then
        v_spirit := v_effect->'resolvedSpiritIds'->>v_target;
        if v_spirit is null or v_spirit = '' then raise exception 'UNKNOWN_NATIONAL_SPIRIT'; end if;
        v_duration := nullif(v_effect->>'duration','')::integer;
        insert into public.country_active_national_spirits(
          country_key,spirit_id,applied_world_date,expires_world_date,source_event_instance_id
        ) values (
          v_target,v_spirit,p_world_date,
          case when v_duration is null then null else p_world_date+v_duration end,
          p_event_instance_id
        ) on conflict(country_key,spirit_id) do update set
          applied_world_date=excluded.applied_world_date,
          expires_world_date=excluded.expires_world_date,
          source_event_instance_id=excluded.source_event_instance_id,
          updated_at=now();
      elsif v_type = 'remove_national_spirit' then
        v_spirit := v_effect->'resolvedSpiritIds'->>v_target;
        if v_spirit is null or v_spirit = '' then raise exception 'UNKNOWN_NATIONAL_SPIRIT'; end if;
        delete from public.country_active_national_spirits where country_key=v_target and spirit_id=v_spirit;
      else
        raise exception 'UNSUPPORTED_EVENT_EFFECT:%', v_type;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('applied',true,'duplicate',false);
end;
$$;

revoke all on function public.tlr_apply_event_choice(text,text,text,text,jsonb,date,uuid) from public,anon,authenticated;
grant execute on function public.tlr_apply_event_choice(text,text,text,text,jsonb,date,uuid) to service_role;

commit;

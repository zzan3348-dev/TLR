create table if not exists public.intelligence_agencies (
  id uuid primary key default gen_random_uuid(), country_id text not null unique references public.countries(country_key) check(country_id ~ '^country-[0-9]{3}$'),
  display_name text not null, emblem_asset_key text not null default 'intelligence/agency', capability numeric check(capability between 0 and 100),
  counterintelligence numeric check(counterintelligence between 0 and 100), operation_slot_cap integer check(operation_slot_cap between 0 and 12),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','DISABLED','UNCONFIGURED')), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.intelligence_upgrade_definitions (
  key text primary key check(key ~ '^[a-z0-9][a-z0-9_]*$'), category text not null check(category in ('INFORMATION','COUNTERINTELLIGENCE','OPERATIONS','TRAINING','CRYPTOGRAPHY')),
  display_name text not null, description text not null default '', icon_asset_key text not null, political_power_cost numeric not null default 0 check(political_power_cost >= 0),
  duration_world_days integer not null default 1 check(duration_world_days > 0), requirements jsonb not null default '{}', modifiers jsonb not null default '{}',
  publish_status text not null default 'DRAFT' check(publish_status in ('DRAFT','PUBLISHED','ARCHIVED')), sort_order integer not null default 0, updated_at timestamptz not null default now()
);
create table if not exists public.country_intelligence_upgrades (
  country_id text not null references public.countries(country_key), upgrade_key text not null references public.intelligence_upgrade_definitions(key), status text not null check(status in ('BUILDING','ACTIVE','CANCELLED')),
  started_world_date date not null, complete_world_date date, version integer not null default 1, primary key(country_id,upgrade_key)
);
create table if not exists public.spy_networks (
  id uuid primary key default gen_random_uuid(), observer_country_id text not null references public.countries(country_key), target_country_id text not null references public.countries(country_key),
  economy_infiltration numeric not null default 0 check(economy_infiltration between 0 and 100), administration_politics_infiltration numeric not null default 0 check(administration_politics_infiltration between 0 and 100),
  research_infiltration numeric not null default 0 check(research_infiltration between 0 and 100), military_infiltration numeric not null default 0 check(military_infiltration between 0 and 100),
  underground_infiltration numeric not null default 0 check(underground_infiltration between 0 and 100), alertness numeric not null default 0 check(alertness between 0 and 100),
  updated_world_date date not null, version integer not null default 1, unique(observer_country_id,target_country_id), check(observer_country_id <> target_country_id)
);
create index if not exists spy_networks_observer_idx on public.spy_networks(observer_country_id,target_country_id);
create table if not exists public.spy_assets (
  id uuid primary key default gen_random_uuid(), observer_country_id text not null references public.countries(country_key), target_country_id text not null references public.countries(country_key),
  domain text not null check(domain in ('ECONOMY','ADMINISTRATION_POLITICS','RESEARCH','MILITARY','UNDERGROUND')), quality numeric not null default 50 check(quality between 0 and 100),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','LOCKED','RECOVERING','COMPROMISED','LOST','EXTRACTED')), compromised boolean not null default false,
  exposed boolean not null default false, created_world_date date not null, recover_after_world_date date, source_operation_id uuid, version integer not null default 1
);
create index if not exists spy_assets_owner_target_idx on public.spy_assets(observer_country_id,target_country_id,status);
create table if not exists public.spy_operation_definitions (
  key text primary key check(key ~ '^[a-z0-9][a-z0-9_]*$'), display_name text not null, description text not null default '', icon_asset_key text not null,
  operation_class text not null check(operation_class in ('COLLECTION','MAJOR')), requirements jsonb not null default '{}', political_power_cost numeric not null default 0 check(political_power_cost >= 0),
  preparation_days integer not null default 1, execution_days integer not null default 1, extraction_days integer not null default 1,
  base_difficulty numeric not null default 50 check(base_difficulty between 0 and 100), base_detection_risk numeric not null default 35 check(base_detection_risk between 0 and 100),
  admin_review_mode text not null default 'REQUIRED' check(admin_review_mode in ('NONE','REQUIRED')), cooldown_days integer not null default 0,
  result_hooks jsonb not null default '{}', publish_status text not null default 'DRAFT' check(publish_status in ('DRAFT','PUBLISHED','ARCHIVED')), sort_order integer not null default 0, updated_at timestamptz not null default now()
);
create table if not exists public.spy_operations (
  id uuid primary key default gen_random_uuid(), definition_key text not null references public.spy_operation_definitions(key), observer_country_id text not null references public.countries(country_key), target_country_id text not null references public.countries(country_key),
  state text not null default 'ACTIVE' check(state in ('DRAFT','ACTIVE','PENDING_ADMIN_REVIEW','COMPLETED','FAILED','CANCELLED','ABORTED')),
  current_phase text not null default 'PREPARATION' check(current_phase in ('PREPARATION','EXECUTION','EXTRACTION','RESULT')),
  started_world_date date not null, phase_end_world_date date, success_result text check(success_result in ('SUCCESS','FAILURE')),
  detection_result text check(detection_result in ('DETECTED','UNDETECTED')), attribution_result text check(attribution_result in ('UNATTRIBUTED','SUSPECTED','ATTRIBUTED')),
  admin_review_status text not null default 'PENDING' check(admin_review_status in ('NOT_REQUIRED','PENDING','APPROVED','REJECTED')),
  operation_idempotency_key text not null unique, result_explanation jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists spy_operations_owner_idx on public.spy_operations(observer_country_id,state,phase_end_world_date);
create table if not exists public.spy_operation_assets (
  operation_id uuid not null references public.spy_operations(id) on delete cascade, asset_id uuid not null references public.spy_assets(id), primary key(operation_id,asset_id)
);
create table if not exists public.spy_operation_cooldowns (
  observer_country_id text not null references public.countries(country_key), target_country_id text not null references public.countries(country_key), definition_key text not null references public.spy_operation_definitions(key),
  available_world_date date not null, recent_count integer not null default 1, primary key(observer_country_id,target_country_id,definition_key)
);
create table if not exists public.intelligence_snapshots (
  id uuid primary key default gen_random_uuid(), observer_country_id text not null references public.countries(country_key), target_country_id text not null references public.countries(country_key),
  domain text not null check(domain in ('ECONOMY','ADMINISTRATION_POLITICS','RESEARCH','MILITARY','UNDERGROUND')), acquired_world_date date not null,
  confidence text not null check(confidence in ('VERY_LOW','LOW','MEDIUM','HIGH','VERY_HIGH')), expires_world_date date not null, payload jsonb not null default '{}',
  source_operation_id uuid references public.spy_operations(id), status text not null default 'CURRENT' check(status in ('CURRENT','AGING','STALE','RETRACTED')), created_at timestamptz not null default now()
);
create index if not exists intelligence_snapshots_owner_idx on public.intelligence_snapshots(observer_country_id,acquired_world_date desc);
create table if not exists public.spy_event_candidates (
  id uuid primary key default gen_random_uuid(), operation_id uuid not null references public.spy_operations(id), event_definition_id text,
  event_type text check(event_type in ('DOCUMENT','NEWSPAPER','SUPER')), status text not null default 'PENDING' check(status in ('PENDING','SCHEDULED','TRIGGERED','HELD','DISCARDED')),
  scheduled_world_date date, payload jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.spy_audit_logs (
  id bigint generated always as identity primary key, operation_id uuid references public.spy_operations(id), actor text not null, actor_kind text not null,
  world_date date not null, real_timestamp timestamptz not null default now(), before_state jsonb, after_state jsonb, reason text not null,
  source_type text not null, source_id text
);
create index if not exists spy_audit_logs_operation_idx on public.spy_audit_logs(operation_id,real_timestamp desc);

insert into public.intelligence_upgrade_definitions(key,category,display_name,description,icon_asset_key,political_power_cost,duration_world_days,sort_order,publish_status) values
('political_network','INFORMATION','정치 정보망','정당·관료조직 정보 수집 강화','law/party-system',35,20,10,'PUBLISHED'),
('economic_network','INFORMATION','경제 정보망','재정·무역 정보 수집 강화','economy/trade',35,20,20,'PUBLISHED'),
('diplomatic_network','INFORMATION','외교 정보망','협정·외교 정보 수집 강화','diplomacy/intel',40,25,30,'PUBLISHED'),
('industrial_network','INFORMATION','산업 정보망','산업 정보 수집 강화','development/industry',40,25,40,'PUBLISHED'),
('domestic_counter_network','COUNTERINTELLIGENCE','국내 방첩망','적대 공작 발각 강화','intelligence/defense',40,25,50,'PUBLISHED'),
('security_cooperation','COUNTERINTELLIGENCE','보안기관 협조','공작 귀속 능력 강화','law/policing',35,20,60,'PUBLISHED'),
('identity_screening','COUNTERINTELLIGENCE','신원검증','위장 신분 탐지 강화','law/registration-system',35,20,70,'PUBLISHED'),
('counter_operation_system','COUNTERINTELLIGENCE','대공작 체계','반복 공작 대응 강화','intelligence/operation',50,30,80,'PUBLISHED'),
('institutional_infiltration','OPERATIONS','기관 침투','행정·정치 침투 강화','law/assembly',45,25,90,'PUBLISHED'),
('influence_operations','OPERATIONS','영향력 공작','선전 공작 강화','law/press',45,25,100,'PUBLISHED'),
('industrial_espionage','OPERATIONS','산업 첩보','산업 공작 강화','law/industry-regulation',50,30,110,'PUBLISHED'),
('sabotage_methods','OPERATIONS','사보타주','시설 교란 능력 강화','military/battle-result',55,35,120,'PUBLISHED'),
('language_training','TRAINING','언어 훈련','현지 위장 강화','law/education',30,15,130,'PUBLISHED'),
('cover_identity','TRAINING','위장 신분','발각·귀속 위험 감소','law/immigration',35,20,140,'PUBLISHED'),
('specialist_operations','TRAINING','전문공작','침투 자산 기여 강화','law/training',45,25,150,'PUBLISHED'),
('psychological_warfare','TRAINING','심리전','여론·지하조직 공작 강화','hud/war-support',45,25,160,'PUBLISHED'),
('encryption','CRYPTOGRAPHY','암호화','자국 통신 보안 강화','intelligence/cipher',40,25,170,'PUBLISHED'),
('decryption','CRYPTOGRAPHY','암호 해독','수집 정보 신뢰도 강화','research/laboratory',45,25,180,'PUBLISHED'),
('signals_interception','CRYPTOGRAPHY','신호 감청','군사·외교 수집 강화','diplomacy/message',50,30,190,'PUBLISHED'),
('information_security','CRYPTOGRAPHY','정보 보안','적 정보 수집 방해','ui/lock',45,25,200,'PUBLISHED')
on conflict(key) do update set category=excluded.category,display_name=excluded.display_name,description=excluded.description,icon_asset_key=excluded.icon_asset_key,political_power_cost=excluded.political_power_cost,duration_world_days=excluded.duration_world_days,sort_order=excluded.sort_order;

insert into public.spy_operation_definitions(key,display_name,description,icon_asset_key,operation_class,requirements,political_power_cost,preparation_days,execution_days,extraction_days,base_difficulty,base_detection_risk,admin_review_mode,cooldown_days,result_hooks,sort_order,publish_status) values
('blueprint_theft','연구 설계도 탈취','연구 자료 획득 후보','research/laboratory','MAJOR','{"domain":"RESEARCH","infiltration":45,"assets":1}',55,18,10,6,55,35,'REQUIRED',12,'{"eventCandidate":true}',10,'PUBLISHED'),
('industrial_sabotage','산업 사보타주','산업 시설 교란 후보','law/industry-regulation','MAJOR','{"domain":"ECONOMY","infiltration":45,"assets":1}',60,20,11,7,58,42,'REQUIRED',14,'{"eventCandidate":true}',20,'PUBLISHED'),
('research_delay','연구 지연','연구 지연 효과 후보','research/investment','MAJOR','{"domain":"RESEARCH","infiltration":35,"assets":1}',50,16,9,6,50,36,'REQUIRED',10,'{"eventCandidate":true}',30,'PUBLISHED'),
('disinformation','선전·허위정보','여론 영향 후보','law/press','MAJOR','{"domain":"ADMINISTRATION_POLITICS","infiltration":30,"assets":1}',45,14,8,5,45,34,'REQUIRED',8,'{"eventCandidate":true}',40,'PUBLISHED'),
('support_resistance','저항조직 지원','저항조직 지원 후보','law/assembly','MAJOR','{"domain":"UNDERGROUND","infiltration":40,"assets":1}',55,21,12,7,56,40,'REQUIRED',14,'{"eventCandidate":true}',50,'PUBLISHED'),
('collaboration_groundwork','협력정부 기반 조성','협력 행정 기반 후보','diplomacy/alliance','MAJOR','{"domain":"UNDERGROUND","infiltration":50,"assets":2}',65,28,15,10,65,44,'REQUIRED',18,'{"eventCandidate":true}',60,'PUBLISHED'),
('incite_rebellion','반란 선동','내전·반란 이벤트 후보','hud/war-support','MAJOR','{"domain":"UNDERGROUND","infiltration":60,"assets":2}',75,35,19,12,75,55,'REQUIRED',21,'{"eventCandidate":true}',70,'PUBLISHED'),
('coordinated_strikes','동시타격 준비','동시 행동 기반 후보','military/army-map','MAJOR','{"domain":"MILITARY","infiltration":55,"assets":2}',70,30,17,11,70,50,'REQUIRED',18,'{"eventCandidate":true}',80,'PUBLISHED'),
('agent_rescue','공작원 구출','노출 자산 회수 후보','intelligence/training','MAJOR','{"domain":"MILITARY","infiltration":25,"assets":1}',40,10,6,4,42,46,'REQUIRED',7,'{"eventCandidate":true}',90,'PUBLISHED')
on conflict(key) do update set display_name=excluded.display_name,description=excluded.description,icon_asset_key=excluded.icon_asset_key,requirements=excluded.requirements,political_power_cost=excluded.political_power_cost,preparation_days=excluded.preparation_days,execution_days=excluded.execution_days,extraction_days=excluded.extraction_days,base_difficulty=excluded.base_difficulty,base_detection_risk=excluded.base_detection_risk,cooldown_days=excluded.cooldown_days,sort_order=excluded.sort_order;

insert into public.intelligence_agencies(country_id,display_name,emblem_asset_key,capability,counterintelligence,operation_slot_cap,status)
select country_key,display_name||' 정보국','intelligence/agency',null,null,2,'ACTIVE' from public.countries where active
on conflict(country_id) do nothing;

create or replace function public.tlr_advance_intelligence(p_world_date date) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_upgrades int:=0; v_phases int:=0; v_reviews int:=0; v_stale int:=0; v_assets int:=0; v_row record; v_def record; v_roll int;
begin
  update country_intelligence_upgrades set status='ACTIVE',version=version+1 where status='BUILDING' and complete_world_date<=p_world_date; get diagnostics v_upgrades=row_count;
  for v_row in select * from spy_operations where state='ACTIVE' and phase_end_world_date<=p_world_date order by phase_end_world_date,id loop
    select * into v_def from spy_operation_definitions where key=v_row.definition_key;
    while v_row.phase_end_world_date is not null and v_row.phase_end_world_date<=p_world_date loop
      if v_row.current_phase='PREPARATION' then
        v_row.current_phase:='EXECUTION'; v_row.phase_end_world_date:=v_row.phase_end_world_date+v_def.execution_days;
        update spy_operations set current_phase=v_row.current_phase,phase_end_world_date=v_row.phase_end_world_date,updated_at=now() where id=v_row.id;
      elsif v_row.current_phase='EXECUTION' then
        v_row.current_phase:='EXTRACTION'; v_row.phase_end_world_date:=v_row.phase_end_world_date+v_def.extraction_days;
        update spy_operations set current_phase=v_row.current_phase,phase_end_world_date=v_row.phase_end_world_date,updated_at=now() where id=v_row.id;
      else
        v_roll:=abs(hashtext(v_row.operation_idempotency_key))%100;
        update spy_operations set current_phase='RESULT',phase_end_world_date=null,state=case when v_def.admin_review_mode='REQUIRED' then 'PENDING_ADMIN_REVIEW' else 'COMPLETED' end,
          success_result=case when v_roll<coalesce((v_row.result_explanation#>>'{scores,success}')::numeric,50) then 'SUCCESS' else 'FAILURE' end,detection_result=case when (abs(hashtext(v_row.operation_idempotency_key||':d'))%100)<coalesce((v_row.result_explanation#>>'{scores,detection}')::numeric,v_def.base_detection_risk) then 'DETECTED' else 'UNDETECTED' end,
          attribution_result=case when (abs(hashtext(v_row.operation_idempotency_key||':a'))%100)<coalesce((v_row.result_explanation#>>'{scores,attribution}')::numeric,33)/2 then 'ATTRIBUTED' when (abs(hashtext(v_row.operation_idempotency_key||':a'))%100)<coalesce((v_row.result_explanation#>>'{scores,attribution}')::numeric,66) then 'SUSPECTED' else 'UNATTRIBUTED' end,
          result_explanation=v_row.result_explanation||jsonb_build_object('seed',v_row.operation_idempotency_key,'systemRecommendation',true),updated_at=now() where id=v_row.id;
        update spy_assets set status='RECOVERING',recover_after_world_date=p_world_date+7,version=version+1 where id in(select asset_id from spy_operation_assets where operation_id=v_row.id) and status='LOCKED';
        if v_def.admin_review_mode='REQUIRED' then insert into spy_event_candidates(operation_id,payload) values(v_row.id,jsonb_build_object('definitionKey',v_row.definition_key)) on conflict do nothing; v_reviews:=v_reviews+1; end if;
        v_row.phase_end_world_date:=null;
      end if;
      v_phases:=v_phases+1;
    end loop;
  end loop;
  update intelligence_snapshots set status=case when expires_world_date<p_world_date then 'STALE' when expires_world_date<=p_world_date+7 then 'AGING' else status end where status in('CURRENT','AGING') and expires_world_date<=p_world_date+7; get diagnostics v_stale=row_count;
  update spy_assets set status='ACTIVE',recover_after_world_date=null,version=version+1 where status='RECOVERING' and recover_after_world_date<=p_world_date; get diagnostics v_assets=row_count;
  update spy_networks set alertness=greatest(0,alertness-(greatest(0,p_world_date-updated_world_date)/30)*3),updated_world_date=p_world_date,version=version+1 where updated_world_date<p_world_date;
  return jsonb_build_object('upgradesCompleted',v_upgrades,'phaseTransitions',v_phases,'reviewsPending',v_reviews,'snapshotsUpdated',v_stale,'assetsRecovered',v_assets);
end $$;

create or replace function public.tlr_charge_intelligence_political_power(p_country text,p_amount numeric) returns numeric language plpgsql security definer set search_path=public as $$
declare v_balance numeric;
begin
  if p_amount<0 then raise exception 'INVALID_POLITICAL_POWER_COST'; end if;
  update country_decision_states set political_power=political_power-p_amount,updated_at=now()
    where country_key=p_country and political_power is not null and political_power>=p_amount returning political_power into v_balance;
  if v_balance is null then
    if not exists(select 1 from country_decision_states where country_key=p_country and political_power is not null) then raise exception 'POLITICAL_POWER_UNSET'; end if;
    raise exception 'INSUFFICIENT_POLITICAL_POWER';
  end if;
  return v_balance;
end $$;

create or replace function public.tlr_audit_intelligence_mutation() returns trigger language plpgsql security definer set search_path=public as $$
declare v_new jsonb:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end; v_old jsonb:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
begin
  insert into spy_audit_logs(operation_id,actor,actor_kind,world_date,before_state,after_state,reason,source_type,source_id)
  values(case when tg_table_name='spy_operations' then nullif(v_new->>'id','')::uuid else null end,'database','SYSTEM',(select current_world_date from world_state where singleton),v_old,v_new,'첩보 데이터 상태 변경',upper(tg_op)||'_TRIGGER',coalesce(v_new->>'id',v_new->>'upgrade_key',v_old->>'id',v_old->>'upgrade_key'));
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;
drop trigger if exists intelligence_agencies_audit on intelligence_agencies; create trigger intelligence_agencies_audit after insert or update or delete on intelligence_agencies for each row execute function tlr_audit_intelligence_mutation();
drop trigger if exists intelligence_upgrades_audit on country_intelligence_upgrades; create trigger intelligence_upgrades_audit after insert or update or delete on country_intelligence_upgrades for each row execute function tlr_audit_intelligence_mutation();
drop trigger if exists spy_networks_audit on spy_networks; create trigger spy_networks_audit after insert or update or delete on spy_networks for each row execute function tlr_audit_intelligence_mutation();
drop trigger if exists spy_assets_audit on spy_assets; create trigger spy_assets_audit after insert or update or delete on spy_assets for each row execute function tlr_audit_intelligence_mutation();
drop trigger if exists spy_operations_audit on spy_operations; create trigger spy_operations_audit after insert or update or delete on spy_operations for each row execute function tlr_audit_intelligence_mutation();
drop trigger if exists intelligence_snapshots_audit on intelligence_snapshots; create trigger intelligence_snapshots_audit after insert or update or delete on intelligence_snapshots for each row execute function tlr_audit_intelligence_mutation();
drop trigger if exists spy_event_candidates_audit on spy_event_candidates; create trigger spy_event_candidates_audit after insert or update or delete on spy_event_candidates for each row execute function tlr_audit_intelligence_mutation();

alter table intelligence_agencies enable row level security; alter table intelligence_upgrade_definitions enable row level security;
alter table country_intelligence_upgrades enable row level security; alter table spy_networks enable row level security; alter table spy_assets enable row level security;
alter table spy_operation_definitions enable row level security; alter table spy_operations enable row level security; alter table spy_operation_assets enable row level security;
alter table spy_operation_cooldowns enable row level security; alter table intelligence_snapshots enable row level security; alter table spy_event_candidates enable row level security; alter table spy_audit_logs enable row level security;
revoke all on intelligence_agencies,intelligence_upgrade_definitions,country_intelligence_upgrades,spy_networks,spy_assets,spy_operation_definitions,spy_operations,spy_operation_assets,spy_operation_cooldowns,intelligence_snapshots,spy_event_candidates,spy_audit_logs from anon,authenticated;
grant all on intelligence_agencies,intelligence_upgrade_definitions,country_intelligence_upgrades,spy_networks,spy_assets,spy_operation_definitions,spy_operations,spy_operation_assets,spy_operation_cooldowns,intelligence_snapshots,spy_event_candidates,spy_audit_logs to service_role;
grant usage,select on sequence spy_audit_logs_id_seq to service_role;
grant execute on function public.tlr_advance_intelligence(date) to service_role;
grant execute on function public.tlr_charge_intelligence_political_power(text,numeric) to service_role;

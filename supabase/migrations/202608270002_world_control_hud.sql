-- TLR 세계시간 요청·세계상황 HUD 기반. 시간 진행 자체는 기존 서버만 수행한다.
alter table public.world_state
  alter column current_world_date set default date '1932-01-01';

update public.world_state
set current_world_date = date '1932-01-01'
where singleton = true and current_world_date = date '1932-04-03';

alter table public.world_state
  add column if not exists world_situation_level smallint not null default 5,
  add column if not exists world_situation_reason text,
  add column if not exists world_situation_changed_world_date date;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'world_state_situation_level_check') then
    alter table public.world_state add constraint world_state_situation_level_check
      check (world_situation_level between 1 and 5);
  end if;
end $$;

create table if not exists public.world_time_requests (
  country_key text primary key references public.countries(country_key) on update cascade on delete cascade,
  request_state text not null check (request_state in ('ADVANCE','HOLD')),
  hold_reason text check (hold_reason in ('DIPLOMACY_NEGOTIATION','MILITARY_OPERATION','EVENT_RESPONSE','DOMESTIC_POLICY','OTHER')),
  details text,
  requested_by_user_id uuid,
  requested_world_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((request_state = 'HOLD' and hold_reason is not null) or (request_state = 'ADVANCE' and hold_reason is null))
);

create index if not exists world_time_requests_state_idx
  on public.world_time_requests(request_state, updated_at desc);

create table if not exists public.world_control_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  actor_kind text not null,
  action text not null,
  world_date date not null,
  before_state jsonb not null default '{}',
  after_state jsonb not null default '{}',
  reason text not null,
  real_timestamp timestamptz not null default now()
);

create index if not exists world_control_audit_logs_time_idx
  on public.world_control_audit_logs(real_timestamp desc);

alter table public.world_time_requests enable row level security;
alter table public.world_control_audit_logs enable row level security;
revoke all on public.world_time_requests from anon, authenticated;
revoke all on public.world_control_audit_logs from anon, authenticated;
grant all on public.world_time_requests to service_role;
grant all on public.world_control_audit_logs to service_role;

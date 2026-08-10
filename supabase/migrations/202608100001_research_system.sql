begin;

alter table public.country_economies
  add column if not exists research_points numeric not null default 0 check (research_points >= 0),
  add column if not exists research_income_per_period numeric not null default 0,
  add column if not exists research_budget_share numeric not null default 0 check (research_budget_share between 0 and 1),
  add column if not exists research_last_settled_world_date date;

create table if not exists public.research_settings (
  singleton boolean primary key default true check (singleton),
  settlement_interval_days integer not null default 30 check (settlement_interval_days > 0),
  default_duration_days integer not null default 365 check (default_duration_days > 0),
  minimum_investment numeric not null default 1 check (minimum_investment > 0),
  investment_exponent numeric not null default 0.5 check (investment_exponent > 0 and investment_exponent <= 1),
  budget_income_multiplier numeric not null default 1 check (budget_income_multiplier >= 0),
  updated_at timestamptz not null default now()
);
insert into public.research_settings(singleton) values (true) on conflict (singleton) do nothing;

create table if not exists public.research_categories (
  id text primary key,
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true
);
insert into public.research_categories(id,name,description,sort_order) values
  ('general','일반 연구','국가 운영과 범용 기술 연구',10),
  ('industry','산업','생산·기반시설·경제 기술 연구',20),
  ('military','군사','군사 교리·장비·조직 연구',30),
  ('society','사회','행정·교육·사회 제도 연구',40)
on conflict (id) do update set name=excluded.name,description=excluded.description,sort_order=excluded.sort_order;

create table if not exists public.research_projects (
  id uuid primary key default gen_random_uuid(),
  country_key text not null,
  title text not null check (char_length(title) between 1 and 120),
  category_id text not null references public.research_categories(id),
  description text not null default '',
  objective text not null default '',
  prerequisites text not null default '',
  admin_notes text not null default '',
  status text not null default 'SUBMITTED' check (status in ('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','ACTIVE','REJECTED','COMPLETED','CANCELLED')),
  initial_investment numeric not null default 0 check (initial_investment >= 0),
  total_investment numeric not null default 0 check (total_investment >= 0),
  requested_by_user_id uuid,
  requested_duration_days integer,
  approved_duration_days integer,
  submitted_world_date date,
  started_world_date date,
  scheduled_completion_world_date date,
  completed_world_date date,
  rejected_world_date date,
  cancelled_world_date date,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists research_projects_country_status_idx on public.research_projects(country_key,status);
create index if not exists research_projects_completion_idx on public.research_projects(status,scheduled_completion_world_date);

create table if not exists public.research_investments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.research_projects(id) on delete cascade,
  country_key text not null,
  amount numeric not null check (amount > 0),
  investment_kind text not null check (investment_kind in ('INITIAL','ADDITIONAL','ADMIN_ADJUSTMENT')),
  idempotency_key text,
  world_date date not null,
  created_at timestamptz not null default now(),
  unique(country_key,idempotency_key)
);

create table if not exists public.research_audit_logs (
  id bigint generated always as identity primary key,
  project_id uuid references public.research_projects(id) on delete set null,
  country_key text,
  actor_subject text,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  world_date date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.research_admin_adjustments (
  id bigint generated always as identity primary key,
  country_key text not null,
  amount numeric not null,
  resulting_balance numeric not null check (resulting_balance >= 0),
  reason text not null default '',
  actor_subject text not null,
  world_date date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.research_effects (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.research_projects(id) on delete cascade,
  effect_key text not null,
  effect_payload jsonb not null default '{}'::jsonb,
  applied_world_date date,
  created_at timestamptz not null default now(),
  unique(project_id,effect_key)
);

create or replace function public.tlr_settle_research_points(p_country text,p_world_date date)
returns table(balance numeric,income_per_period numeric)
language plpgsql security definer set search_path=public as $$
declare v_row public.country_economies%rowtype; v_days int; v_interval int; v_multiplier numeric; v_effective_income numeric;
begin
  insert into public.country_economies(country_key,research_last_settled_world_date) values(p_country,p_world_date)
    on conflict(country_key) do nothing;
  select * into v_row from public.country_economies where country_key=p_country for update;
  select settlement_interval_days,budget_income_multiplier into v_interval,v_multiplier from public.research_settings where singleton=true;
  v_effective_income := greatest(0,
    coalesce(v_row.research_income_per_period,0)
    + coalesce(v_row.research_capacity,0) * coalesce(v_row.research_budget_share,0) * coalesce(v_multiplier,1)
  );
  if v_row.research_last_settled_world_date is null then
    update public.country_economies set research_last_settled_world_date=p_world_date where country_key=p_country;
  else
    v_days := greatest(0,p_world_date-v_row.research_last_settled_world_date);
    if v_days >= v_interval then
      update public.country_economies set
        research_points=research_points+(floor(v_days::numeric/v_interval)*v_effective_income),
        research_last_settled_world_date=research_last_settled_world_date+(floor(v_days::numeric/v_interval)::int*v_interval)
      where country_key=p_country returning * into v_row;
    end if;
  end if;
  select * into v_row from public.country_economies where country_key=p_country;
  return query select v_row.research_points,v_effective_income;
end $$;

create or replace function public.tlr_approve_research_project(
  p_project uuid,p_duration_days integer,p_admin text,p_world_date date,p_notes text default ''
) returns text language plpgsql security definer set search_path=public as $$
declare v_project public.research_projects%rowtype; v_balance numeric;
begin
  select * into v_project from public.research_projects where id=p_project for update;
  if v_project.id is null then raise exception 'RESEARCH_PROJECT_NOT_FOUND'; end if;
  if v_project.status not in ('SUBMITTED','UNDER_REVIEW','APPROVED') then raise exception 'RESEARCH_PROJECT_NOT_REVIEWABLE'; end if;
  perform public.tlr_settle_research_points(v_project.country_key,p_world_date);
  select research_points into v_balance from public.country_economies where country_key=v_project.country_key for update;
  update public.research_projects set status='APPROVED',approved_duration_days=p_duration_days,admin_notes=coalesce(p_notes,''),updated_at=now() where id=p_project;
  if v_balance < v_project.initial_investment then
    insert into public.research_audit_logs(project_id,country_key,actor_subject,action,details,world_date)
      values(p_project,v_project.country_key,p_admin,'APPROVED_WAITING_FUNDS',jsonb_build_object('required',v_project.initial_investment,'balance',v_balance),p_world_date);
    return 'APPROVED';
  end if;
  update public.country_economies set research_points=research_points-v_project.initial_investment where country_key=v_project.country_key;
  update public.research_projects set status='ACTIVE',total_investment=v_project.initial_investment,started_world_date=p_world_date,
    scheduled_completion_world_date=p_world_date+p_duration_days,updated_at=now() where id=p_project;
  insert into public.research_investments(project_id,country_key,amount,investment_kind,idempotency_key,world_date)
    values(p_project,v_project.country_key,v_project.initial_investment,'INITIAL','initial:'||p_project::text,p_world_date)
    on conflict(country_key,idempotency_key) do nothing;
  insert into public.research_audit_logs(project_id,country_key,actor_subject,action,details,world_date)
    values(p_project,v_project.country_key,p_admin,'APPROVED_AND_STARTED',jsonb_build_object('durationDays',p_duration_days),p_world_date);
  return 'ACTIVE';
end $$;

create or replace function public.tlr_preview_research_investment(p_project uuid,p_amount numeric,p_world_date date)
returns table(amount numeric,current_completion_date date,projected_completion_date date,balance_after numeric)
language plpgsql security definer set search_path=public as $$
declare v_project public.research_projects%rowtype; v_balance numeric; v_exponent numeric; v_remaining int; v_new_remaining int;
begin
  select * into v_project from public.research_projects where id=p_project;
  if v_project.id is null then raise exception 'RESEARCH_PROJECT_NOT_FOUND'; end if;
  if v_project.status <> 'ACTIVE' then raise exception 'RESEARCH_PROJECT_NOT_ACTIVE'; end if;
  select research_points into v_balance from public.country_economies where country_key=v_project.country_key;
  if p_amount <= 0 or v_balance < p_amount then raise exception 'INSUFFICIENT_RESEARCH_POINTS'; end if;
  select investment_exponent into v_exponent from public.research_settings where singleton=true;
  v_remaining := greatest(1,v_project.scheduled_completion_world_date-p_world_date);
  v_new_remaining := greatest(1,ceil(v_remaining*power(v_project.total_investment/(v_project.total_investment+p_amount),v_exponent))::int);
  return query select p_amount,v_project.scheduled_completion_world_date,p_world_date+v_new_remaining,v_balance-p_amount;
end $$;

create or replace function public.tlr_invest_research_project(
  p_project uuid,p_amount numeric,p_world_date date,p_idempotency_key text,p_user text
) returns date language plpgsql security definer set search_path=public as $$
declare v_project public.research_projects%rowtype; v_balance numeric; v_exponent numeric; v_remaining int; v_new_remaining int; v_existing uuid;
begin
  select id into v_existing from public.research_investments where country_key=(select country_key from public.research_projects where id=p_project) and idempotency_key=p_idempotency_key;
  if v_existing is not null then return (select scheduled_completion_world_date from public.research_projects where id=p_project); end if;
  select * into v_project from public.research_projects where id=p_project for update;
  if v_project.id is null then raise exception 'RESEARCH_PROJECT_NOT_FOUND'; end if;
  if v_project.status <> 'ACTIVE' then raise exception 'RESEARCH_PROJECT_NOT_ACTIVE'; end if;
  select research_points into v_balance from public.country_economies where country_key=v_project.country_key for update;
  if p_amount <= 0 or v_balance < p_amount then raise exception 'INSUFFICIENT_RESEARCH_POINTS'; end if;
  select investment_exponent into v_exponent from public.research_settings where singleton=true;
  v_remaining := greatest(1,v_project.scheduled_completion_world_date-p_world_date);
  v_new_remaining := greatest(1,ceil(v_remaining*power(v_project.total_investment/(v_project.total_investment+p_amount),v_exponent))::int);
  update public.country_economies set research_points=research_points-p_amount where country_key=v_project.country_key;
  update public.research_projects set total_investment=total_investment+p_amount,scheduled_completion_world_date=p_world_date+v_new_remaining,updated_at=now() where id=p_project;
  insert into public.research_investments(project_id,country_key,amount,investment_kind,idempotency_key,world_date)
    values(p_project,v_project.country_key,p_amount,'ADDITIONAL',p_idempotency_key,p_world_date);
  insert into public.research_audit_logs(project_id,country_key,actor_subject,action,details,world_date)
    values(p_project,v_project.country_key,p_user,'ADDITIONAL_INVESTMENT',jsonb_build_object('amount',p_amount,'completionDate',p_world_date+v_new_remaining),p_world_date);
  return p_world_date+v_new_remaining;
end $$;

create or replace function public.tlr_advance_research(p_world_date date)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  update public.research_projects set status='COMPLETED',completed_world_date=p_world_date,updated_at=now()
    where status='ACTIVE' and scheduled_completion_world_date<=p_world_date;
  get diagnostics v_count=row_count;
  return v_count;
end $$;

alter table public.research_settings enable row level security;
alter table public.research_categories enable row level security;
alter table public.research_projects enable row level security;
alter table public.research_investments enable row level security;
alter table public.research_audit_logs enable row level security;
alter table public.research_admin_adjustments enable row level security;
alter table public.research_effects enable row level security;
revoke all on public.research_settings,public.research_projects,public.research_investments,public.research_audit_logs,public.research_admin_adjustments,public.research_effects from anon,authenticated;
grant select on public.research_categories to anon,authenticated;

revoke execute on function public.tlr_settle_research_points(text,date) from public,anon,authenticated;
revoke execute on function public.tlr_approve_research_project(uuid,integer,text,date,text) from public,anon,authenticated;
revoke execute on function public.tlr_preview_research_investment(uuid,numeric,date) from public,anon,authenticated;
revoke execute on function public.tlr_invest_research_project(uuid,numeric,date,text,text) from public,anon,authenticated;
revoke execute on function public.tlr_advance_research(date) from public,anon,authenticated;
grant execute on function public.tlr_settle_research_points(text,date) to service_role;
grant execute on function public.tlr_approve_research_project(uuid,integer,text,date,text) to service_role;
grant execute on function public.tlr_preview_research_investment(uuid,numeric,date) to service_role;
grant execute on function public.tlr_invest_research_project(uuid,numeric,date,text,text) to service_role;
grant execute on function public.tlr_advance_research(date) to service_role;

commit;

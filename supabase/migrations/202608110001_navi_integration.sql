begin;

-- Discord 서버 역할만으로 연구 관리자 권한을 부여하지 않는다.
-- TLR 프로필을 명시적으로 등록한 계정만 NAVI 관리자 API를 사용할 수 있다.
create table if not exists public.navi_admin_members (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'superadmin')),
  active boolean not null default true,
  granted_by text not null,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.navi_admin_members enable row level security;
revoke all on public.navi_admin_members from anon, authenticated;

alter table public.research_projects
  add column if not exists submission_idempotency_key text;
create unique index if not exists research_projects_country_submission_idempotency_idx
  on public.research_projects(country_key, submission_idempotency_key)
  where submission_idempotency_key is not null;

alter table public.research_investments
  add column if not exists source text not null default 'SITE';
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='research_investments_source_check'
      and conrelid='public.research_investments'::regclass
  ) then
    alter table public.research_investments
      add constraint research_investments_source_check
      check (source in ('SITE','NAVI','ADMIN','SYSTEM'));
  end if;
end $$;

create or replace function public.tlr_submit_research_project(
  p_country text,
  p_title text,
  p_category text,
  p_description text,
  p_objective text,
  p_prerequisites text,
  p_initial_investment numeric,
  p_requested_by uuid,
  p_world_date date,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_project uuid;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key)='' then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_initial_investment <= 0 then
    raise exception 'INVALID_INITIAL_INVESTMENT';
  end if;

  insert into public.research_projects(
    country_key, title, category_id, description, objective, prerequisites,
    status, initial_investment, total_investment, requested_by_user_id,
    submitted_world_date, submission_idempotency_key
  ) values (
    p_country, p_title, p_category, p_description, p_objective,
    coalesce(p_prerequisites,''), 'SUBMITTED', p_initial_investment, 0,
    p_requested_by, p_world_date, p_idempotency_key
  )
  on conflict (country_key, submission_idempotency_key)
    where submission_idempotency_key is not null
  do nothing
  returning id into v_project;

  if v_project is null then
    select id into v_project
    from public.research_projects
    where country_key=p_country
      and submission_idempotency_key=p_idempotency_key;
    return v_project;
  end if;

  insert into public.research_audit_logs(
    project_id,country_key,actor_subject,action,details,world_date
  ) values (
    v_project,p_country,p_requested_by::text,'SUBMITTED',
    jsonb_build_object('initialInvestment',p_initial_investment,'source','NAVI'),
    p_world_date
  );
  return v_project;
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
      values(p_project,v_project.country_key,p_admin,'APPROVED_WAITING_FUNDS',jsonb_build_object('required',v_project.initial_investment,'balance',v_balance,'source','ADMIN'),p_world_date);
    return 'APPROVED';
  end if;
  update public.country_economies set research_points=research_points-v_project.initial_investment where country_key=v_project.country_key;
  update public.research_projects set status='ACTIVE',total_investment=v_project.initial_investment,started_world_date=p_world_date,
    scheduled_completion_world_date=p_world_date+p_duration_days,updated_at=now() where id=p_project;
  insert into public.research_investments(project_id,country_key,amount,investment_kind,idempotency_key,world_date,source)
    values(p_project,v_project.country_key,v_project.initial_investment,'INITIAL','initial:'||p_project::text,p_world_date,'ADMIN')
    on conflict(country_key,idempotency_key) do nothing;
  insert into public.research_audit_logs(project_id,country_key,actor_subject,action,details,world_date)
    values(p_project,v_project.country_key,p_admin,'APPROVED_AND_STARTED',jsonb_build_object('durationDays',p_duration_days,'source','ADMIN'),p_world_date);
  return 'ACTIVE';
end $$;

create or replace function public.tlr_invest_research_project(
  p_project uuid,p_amount numeric,p_world_date date,p_idempotency_key text,p_user text
) returns date language plpgsql security definer set search_path=public as $$
declare v_project public.research_projects%rowtype; v_balance numeric; v_exponent numeric; v_remaining int; v_new_remaining int; v_existing uuid; v_source text;
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
  v_source := case when p_idempotency_key like 'navi:%' then 'NAVI' else 'SITE' end;
  update public.country_economies set research_points=research_points-p_amount where country_key=v_project.country_key;
  update public.research_projects set total_investment=total_investment+p_amount,scheduled_completion_world_date=p_world_date+v_new_remaining,updated_at=now() where id=p_project;
  insert into public.research_investments(project_id,country_key,amount,investment_kind,idempotency_key,world_date,source)
    values(p_project,v_project.country_key,p_amount,'ADDITIONAL',p_idempotency_key,p_world_date,v_source);
  insert into public.research_audit_logs(project_id,country_key,actor_subject,action,details,world_date)
    values(p_project,v_project.country_key,p_user,'ADDITIONAL_INVESTMENT',jsonb_build_object('amount',p_amount,'completionDate',p_world_date+v_new_remaining,'source',v_source),p_world_date);
  return p_world_date+v_new_remaining;
end $$;

revoke execute on function public.tlr_submit_research_project(text,text,text,text,text,text,numeric,uuid,date,text) from public, anon, authenticated;
grant execute on function public.tlr_submit_research_project(text,text,text,text,text,text,numeric,uuid,date,text) to service_role;

-- 세계시간에 의해 자동 완료된 연구도 사이트/NAVI 공통 이벤트에 남긴다.
-- Discord 전송은 이 transaction 밖에서 감사 로그를 polling하므로 실패를 전파하지 않는다.
create or replace function public.tlr_advance_research(p_world_date date)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count integer;
begin
  with completed as (
    update public.research_projects
    set status='COMPLETED', completed_world_date=p_world_date, updated_at=now()
    where status='ACTIVE' and scheduled_completion_world_date<=p_world_date
    returning id, country_key
  )
  insert into public.research_audit_logs(
    project_id, country_key, actor_subject, action, details, world_date
  )
  select id, country_key, 'SYSTEM', 'COMPLETED',
    jsonb_build_object('source', 'WORLD_TIME'), p_world_date
  from completed;
  get diagnostics v_count=row_count;
  return v_count;
end $$;

revoke execute on function public.tlr_advance_research(date) from public, anon, authenticated;
grant execute on function public.tlr_advance_research(date) to service_role;

commit;

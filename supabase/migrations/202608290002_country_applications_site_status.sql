begin;

create table if not exists public.country_applications (
  id uuid primary key default gen_random_uuid(),
  country_key text not null references public.countries(country_key),
  user_id uuid not null references public.profiles(id) on delete cascade,
  discord_user_id text not null,
  status text not null default 'pending'
    check (status in ('pending','processing','notified','failed','approved','rejected')),
  discord_message_id text,
  failure_code text,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, country_key)
);

create index if not exists country_applications_country_status_idx
  on public.country_applications(country_key,status,created_at);

create table if not exists public.discord_country_emojis (
  country_key text not null references public.countries(country_key),
  guild_id text not null,
  emoji_id text,
  emoji_name text not null,
  status text not null default 'processing' check(status in ('processing','ready','failed')),
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (country_key,guild_id),
  unique (guild_id,emoji_name)
);

create unique index if not exists discord_country_emojis_guild_emoji_idx
  on public.discord_country_emojis(guild_id,emoji_id) where emoji_id is not null;

create table if not exists public.site_config (
  singleton boolean primary key default true check (singleton),
  status text not null default 'pre_open' check (status in ('pre_open','open')),
  opened_at timestamptz,
  opened_by text,
  updated_at timestamptz not null default now()
);

insert into public.site_config(singleton,status)
values (true,'pre_open')
on conflict(singleton) do nothing;

create or replace function public.tlr_begin_country_application(
  p_country_key text,
  p_user_id uuid,
  p_discord_user_id text
) returns table(application_id uuid,application_status text,should_notify boolean)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row public.country_applications%rowtype;
begin
  if not exists(select 1 from public.countries where country_key=p_country_key and active) then
    raise exception 'COUNTRY_NOT_AVAILABLE';
  end if;
  if not exists(select 1 from public.profiles where id=p_user_id and discord_user_id=p_discord_user_id) then
    raise exception 'DISCORD_ID_MISMATCH';
  end if;

  insert into public.country_applications(country_key,user_id,discord_user_id,status)
  values(p_country_key,p_user_id,p_discord_user_id,'processing')
  on conflict(user_id,country_key) do nothing
  returning * into v_row;

  if v_row.id is not null then
    return query select v_row.id,v_row.status,true;
    return;
  end if;

  select * into v_row
  from public.country_applications
  where user_id=p_user_id and country_key=p_country_key
  for update;

  if v_row.status='failed' then
    update public.country_applications
    set status='processing',failure_code=null,updated_at=now()
    where id=v_row.id
    returning * into v_row;
    return query select v_row.id,v_row.status,true;
    return;
  end if;

  return query select v_row.id,v_row.status,false;
end;
$$;

create or replace function public.tlr_open_site(p_opened_by text)
returns table(status text,opened_at timestamptz,opened_by text,changed boolean)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_changed integer;
begin
  update public.site_config
  set status='open',opened_at=now(),opened_by=p_opened_by,updated_at=now()
  where singleton=true and site_config.status='pre_open';
  get diagnostics v_changed=row_count;
  return query
  select c.status,c.opened_at,c.opened_by,(v_changed=1)
  from public.site_config c where c.singleton=true;
end;
$$;

create or replace function public.tlr_reserve_country_emoji(
  p_country_key text,
  p_guild_id text,
  p_emoji_name text
) returns table(emoji_id text,emoji_name text,emoji_status text,should_create boolean)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row public.discord_country_emojis%rowtype;
begin
  insert into public.discord_country_emojis(country_key,guild_id,emoji_name,status)
  values(p_country_key,p_guild_id,p_emoji_name,'processing')
  on conflict(country_key,guild_id) do nothing
  returning * into v_row;
  if v_row.country_key is not null then
    return query select v_row.emoji_id,v_row.emoji_name,v_row.status,true;
    return;
  end if;
  select * into v_row from public.discord_country_emojis
  where country_key=p_country_key and guild_id=p_guild_id for update;
  if v_row.status='failed' then
    update public.discord_country_emojis
    set status='processing',failure_code=null,updated_at=now()
    where country_key=p_country_key and guild_id=p_guild_id
    returning * into v_row;
    return query select v_row.emoji_id,v_row.emoji_name,v_row.status,true;
    return;
  end if;
  return query select v_row.emoji_id,v_row.emoji_name,v_row.status,false;
end;
$$;

-- 기존 국가 신청이 즉시 운영권으로 잘못 저장된 일반 유저 기록을 신청 대기열로 이관한다.
insert into public.country_applications(country_key,user_id,discord_user_id,status,created_at,updated_at)
select ownership.country_key,ownership.user_id,profile.discord_user_id,'pending',ownership.assigned_at,now()
from public.country_ownerships ownership
join public.profiles profile on profile.id=ownership.user_id
where ownership.status='active'
  and not exists (
    select 1 from public.navi_admin_members member
    where member.profile_id=ownership.user_id and member.active=true
  )
on conflict(user_id,country_key) do nothing;

-- 관리자 Discord 계정에 남아 있던 테스트용 국가 운영권만 회수한다.
update public.country_ownerships ownership
set status='revoked',revoked_at=now(),updated_at=now()
where ownership.status='active'
  and exists (
    select 1 from public.navi_admin_members member
    where member.profile_id=ownership.user_id and member.active=true
  );

alter table public.country_applications enable row level security;
alter table public.discord_country_emojis enable row level security;
alter table public.site_config enable row level security;
revoke all on public.country_applications from anon,authenticated;
revoke all on public.discord_country_emojis from anon,authenticated;
revoke all on public.site_config from anon,authenticated;
revoke all on function public.tlr_begin_country_application(text,uuid,text) from public,anon,authenticated;
revoke all on function public.tlr_open_site(text) from public,anon,authenticated;
revoke all on function public.tlr_reserve_country_emoji(text,text,text) from public,anon,authenticated;
grant execute on function public.tlr_begin_country_application(text,uuid,text) to service_role;
grant execute on function public.tlr_open_site(text) to service_role;
grant execute on function public.tlr_reserve_country_emoji(text,text,text) to service_role;

commit;

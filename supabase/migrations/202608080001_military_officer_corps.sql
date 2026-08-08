-- TLR 군사·대교리·장교단 기반 스키마
-- 사용자에게 노출되는 한국어 문자열은 UTF-8로 저장한다.

create table if not exists public.civil_war_spectrums (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  display_name_ko text not null,
  description_ko text not null default '',
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ideology_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  display_name_ko text not null,
  description_ko text not null default '',
  color text,
  icon_path text,
  civil_war_spectrum_id uuid references public.civil_war_spectrums(id) on delete set null,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.political_party_ideology_categories (
  party_key text primary key,
  ideology_category_id uuid references public.ideology_categories(id) on delete set null,
  detailed_ideology_key text,
  updated_at timestamptz not null default now()
);

create table if not exists public.country_ideology_support (
  country_key text not null,
  ideology_category_id uuid not null references public.ideology_categories(id) on delete cascade,
  support_percent numeric not null check (support_percent >= 0 and support_percent <= 100),
  updated_at timestamptz not null default now(),
  primary key (country_key, ideology_category_id)
);

create table if not exists public.grand_doctrines (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  display_name_ko text not null,
  source_name text,
  description_ko text not null default '',
  icon_path text,
  configuration_status text not null default 'PARTIAL'
    check (configuration_status in ('PARTIAL', 'READY', 'DISABLED')),
  enabled boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.grand_doctrine_effects (
  id uuid primary key default gen_random_uuid(),
  doctrine_id uuid not null references public.grand_doctrines(id) on delete cascade,
  effect_key text not null,
  value numeric not null,
  unit text not null default 'flat' check (unit in ('flat', 'percent')),
  display_text_ko text not null,
  admin_guidance_ko text not null default '',
  sort_order integer not null default 0,
  unique (doctrine_id, effect_key)
);

create table if not exists public.officer_spirits (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  category text not null check (category in ('ACADEMY', 'ARMY', 'DIVISION_COMMAND')),
  display_name_ko text not null,
  source_name text,
  description_ko text not null default '',
  icon_path text,
  configuration_status text not null default 'PARTIAL'
    check (configuration_status in ('PARTIAL', 'READY', 'DISABLED')),
  enabled boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.officer_spirit_effects (
  id uuid primary key default gen_random_uuid(),
  spirit_id uuid not null references public.officer_spirits(id) on delete cascade,
  effect_key text not null,
  value numeric not null,
  unit text not null default 'flat' check (unit in ('flat', 'percent')),
  display_text_ko text not null,
  admin_guidance_ko text not null default '',
  sort_order integer not null default 0,
  unique (spirit_id, effect_key)
);

create table if not exists public.military_requirement_groups (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('GRAND_DOCTRINE', 'OFFICER_SPIRIT')),
  target_id uuid not null,
  match_mode text not null default 'ALL' check (match_mode in ('ALL', 'ANY')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.military_requirements (
  id uuid primary key default gen_random_uuid(),
  requirement_group_id uuid not null references public.military_requirement_groups(id) on delete cascade,
  requirement_type text not null check (requirement_type in (
    'IDEOLOGY_CATEGORY_IS', 'IDEOLOGY_CATEGORY_IS_NOT',
    'IDEOLOGY_CATEGORY_SUPPORT_AT_LEAST', 'IDEOLOGY_CATEGORY_SUPPORT_AT_MOST',
    'CIVIL_WAR_SPECTRUM_IS', 'CIVIL_WAR_SPECTRUM_IS_NOT',
    'HAS_GRAND_DOCTRINE', 'DOES_NOT_HAVE_GRAND_DOCTRINE',
    'HAS_OFFICER_SPIRIT', 'DOES_NOT_HAVE_OFFICER_SPIRIT',
    'HAS_LAW', 'DOES_NOT_HAVE_LAW',
    'COUNTRY_STAT_AT_LEAST', 'COUNTRY_STAT_AT_MOST',
    'WORLD_DATE_AFTER', 'WORLD_DATE_BEFORE', 'CUSTOM_ADMIN_FLAG'
  )),
  operator text,
  target_id text,
  numeric_value numeric,
  boolean_value boolean,
  metadata jsonb not null default '{}'::jsonb,
  description_ko text not null default '',
  sort_order integer not null default 0
);

create table if not exists public.country_officer_corps (
  country_key text primary key,
  grand_doctrine_id uuid references public.grand_doctrines(id) on delete set null,
  academy_spirit_id uuid references public.officer_spirits(id) on delete set null,
  army_spirit_id uuid references public.officer_spirits(id) on delete set null,
  division_command_spirit_id uuid references public.officer_spirits(id) on delete set null,
  version integer not null default 1,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.country_officer_spirit_history (
  id bigint generated by default as identity primary key,
  country_key text not null,
  category text not null check (category in ('ACADEMY', 'ARMY', 'DIVISION_COMMAND')),
  previous_spirit_id uuid references public.officer_spirits(id) on delete set null,
  selected_spirit_id uuid references public.officer_spirits(id) on delete set null,
  changed_by text not null,
  world_date date,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.country_grand_doctrine_history (
  id bigint generated by default as identity primary key,
  country_key text not null,
  previous_doctrine_id uuid references public.grand_doctrines(id) on delete set null,
  selected_doctrine_id uuid references public.grand_doctrines(id) on delete set null,
  changed_by text not null,
  world_date date,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.country_military_admin_flags (
  country_key text not null,
  flag_key text not null,
  enabled boolean not null default true,
  note text not null default '',
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (country_key, flag_key)
);

-- 인력 수치가 실제로 설정된 국가만 병력 생성 요청을 할 수 있다.
-- null은 0이 아니라 "아직 설정되지 않음"을 뜻한다.
create table if not exists public.country_military_resources (
  country_key text primary key,
  available_manpower integer check (available_manpower is null or available_manpower >= 0),
  reserved_manpower integer not null default 0 check (reserved_manpower >= 0),
  reserved_production_capacity numeric not null default 0 check (reserved_production_capacity >= 0),
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- 기존 군사창이 사용하는 핵심 객체. 비용이 미설정인 템플릿은 READY가 될 수 없다.
create table if not exists public.military_templates (
  id uuid primary key default gen_random_uuid(),
  force_kind text not null check (force_kind in ('LAND_UNIT', 'VESSEL', 'AIR_WING')),
  display_name text not null,
  manpower_required integer,
  crew_required integer,
  production_capacity_required numeric,
  formation_days integer,
  equipment_requirements jsonb,
  active boolean not null default true,
  configuration_status text not null default 'PARTIAL'
    check (configuration_status in ('UNCONFIGURED', 'PARTIAL', 'READY', 'DISABLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.military_land_units (
  id uuid primary key default gen_random_uuid(),
  country_key text not null,
  display_name text not null,
  template_id uuid not null references public.military_templates(id),
  current_manpower integer not null default 0,
  max_manpower integer not null default 0,
  equipment_readiness numeric,
  training_level numeric,
  status text not null default 'QUEUED',
  assigned_front_id uuid,
  assigned_conflict_id uuid,
  created_world_date date not null,
  completed_world_date date,
  disbanded_world_date date,
  version integer not null default 1
);

create table if not exists public.military_fleets (
  id uuid primary key default gen_random_uuid(), country_key text not null,
  display_name text not null, status text not null default 'ACTIVE',
  assigned_front_id uuid, assigned_conflict_id uuid,
  created_world_date date not null, dissolved_world_date date, version integer not null default 1
);

create table if not exists public.military_vessels (
  id uuid primary key default gen_random_uuid(), country_key text not null,
  display_name text not null, template_id uuid not null references public.military_templates(id),
  status text not null default 'QUEUED', fleet_id uuid references public.military_fleets(id) on delete set null,
  assigned_front_id uuid, assigned_conflict_id uuid,
  laid_down_world_date date not null, commissioned_world_date date, sunk_world_date date,
  version integer not null default 1
);

create table if not exists public.military_air_wings (
  id uuid primary key default gen_random_uuid(), country_key text not null,
  display_name text not null, template_id uuid not null references public.military_templates(id),
  current_personnel integer not null default 0, max_personnel integer not null default 0,
  readiness numeric, training_level numeric, status text not null default 'FORMING',
  assigned_front_id uuid, assigned_conflict_id uuid,
  created_world_date date not null, completed_world_date date, disbanded_world_date date,
  version integer not null default 1
);

create table if not exists public.military_creation_queues (
  id uuid primary key default gen_random_uuid(),
  country_key text not null,
  template_id uuid not null references public.military_templates(id),
  force_kind text not null check (force_kind in ('LAND_UNIT', 'VESSEL', 'AIR_WING')),
  requested_name text,
  status text not null default 'QUEUED'
    check (status in ('QUEUED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  manpower_reserved integer not null default 0,
  production_capacity_reserved numeric not null default 0,
  requested_world_date date not null,
  completion_world_date date not null,
  idempotency_key text not null,
  requested_by text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  unique (country_key, idempotency_key)
);

create table if not exists public.military_conflicts (
  id uuid primary key default gen_random_uuid(), display_name text not null,
  conflict_type text not null, status text not null default 'DRAFT', tags text[] not null default '{}',
  declared_world_date date, started_world_date date, ended_world_date date,
  version integer not null default 1, created_at timestamptz not null default now()
);

create table if not exists public.military_conflict_sides (
  id uuid primary key default gen_random_uuid(), conflict_id uuid not null references public.military_conflicts(id) on delete cascade,
  display_name text not null, sort_order integer not null default 0
);

create table if not exists public.military_conflict_participants (
  id uuid primary key default gen_random_uuid(), conflict_id uuid not null references public.military_conflicts(id) on delete cascade,
  side_id uuid not null references public.military_conflict_sides(id) on delete cascade,
  country_key text, internal_actor_id text, role text not null default 'BELLIGERENT',
  joined_world_date date not null, left_world_date date
);

create table if not exists public.military_fronts (
  id uuid primary key default gen_random_uuid(), conflict_id uuid not null references public.military_conflicts(id) on delete cascade,
  front_kind text not null check (front_kind in ('LAND_LINE', 'NAVAL_AREA')),
  display_name text not null, owner_side_id uuid not null references public.military_conflict_sides(id),
  opponent_side_id uuid not null references public.military_conflict_sides(id),
  geometry jsonb not null default '[]'::jsonb, status text not null default 'DRAFT', version integer not null default 1
);

create table if not exists public.military_actions (
  id uuid primary key default gen_random_uuid(), conflict_id uuid not null references public.military_conflicts(id) on delete cascade,
  country_key text not null, front_id uuid references public.military_fronts(id) on delete set null,
  title text not null, body text not null default '', status text not null default 'DRAFT',
  submitted_world_date date, version integer not null default 1, created_at timestamptz not null default now()
);

create table if not exists public.military_action_assignments (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.military_actions(id) on delete cascade,
  object_kind text not null check (object_kind in ('LAND_UNIT', 'VESSEL', 'FLEET', 'AIR_WING')),
  object_id uuid not null,
  unique (action_id, object_kind, object_id)
);

create table if not exists public.military_action_resolutions (
  id uuid primary key default gen_random_uuid(), action_id uuid not null unique references public.military_actions(id) on delete cascade,
  outcome text not null, summary text not null, losses jsonb not null default '{}'::jsonb,
  state_changes jsonb not null default '{}'::jsonb, territory_changes jsonb not null default '{}'::jsonb,
  resolved_world_date date not null, admin_user_id text not null, created_at timestamptz not null default now()
);

create table if not exists public.military_occupations (
  id uuid primary key default gen_random_uuid(), conflict_id uuid not null references public.military_conflicts(id) on delete cascade,
  legal_owner_country_key text not null, occupier_country_key text not null,
  geometry jsonb not null default '[]'::jsonb, status text not null default 'ACTIVE_OCCUPATION',
  started_world_date date not null, ended_world_date date, version integer not null default 1
);

create table if not exists public.military_war_reports (
  id uuid primary key default gen_random_uuid(), conflict_id uuid not null references public.military_conflicts(id) on delete cascade,
  title text not null, body text not null, report_world_date date not null,
  front_id uuid references public.military_fronts(id) on delete set null,
  action_id uuid references public.military_actions(id) on delete set null,
  winner_side_id uuid, loser_side_id uuid, losses jsonb not null default '{}'::jsonb,
  outcomes jsonb not null default '{}'::jsonb, territory_summary text, marker jsonb,
  visibility text not null default 'PUBLIC', marker_tone text
);

create table if not exists public.military_notifications (
  id uuid primary key default gen_random_uuid(),
  country_key text not null,
  notification_type text not null,
  conflict_id uuid references public.military_conflicts(id) on delete cascade,
  title text not null,
  body text not null,
  world_date date not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.military_audit_logs (
  id bigint generated by default as identity primary key,
  actor_subject text not null,
  actor_kind text not null,
  action_kind text not null,
  target_kind text not null,
  target_id text,
  country_key text,
  before_state jsonb,
  after_state jsonb,
  world_date date,
  created_at timestamptz not null default now()
);

insert into public.officer_spirits (key, category, display_name_ko, source_name, sort_order)
values
  ('academy-bold-attack','ACADEMY','과감한 공격','Bold Attack',10),
  ('academy-tenacious-defense','ACADEMY','완강한 방어','Tenacious Defense',20),
  ('academy-meticulous-preparation','ACADEMY','철저한 준비','Meticulous Preparation',30),
  ('academy-political-loyalty','ACADEMY','정치적 충성','Political Loyalty',40),
  ('academy-scholarships','ACADEMY','사관학교 장학제도','Academy Scholarships',50),
  ('academy-best-of-the-best','ACADEMY','최정예 선발','Best of the Best',60),
  ('academy-embrace-the-future','ACADEMY','미래지향 교육','Embrace the Future',70),
  ('academy-engineering-schools','ACADEMY','공병학교','Engineering Schools',80),
  ('academy-inventive-leadership','ACADEMY','창의적 지휘','Inventive Leadership',90),
  ('academy-queen-of-battle','ACADEMY','전장의 여왕','The Queen of Battle',100),
  ('academy-theatre-training','ACADEMY','전구 훈련','Theatre Training',110),
  ('army-professional-officer-corps','ARMY','전문 장교단','Professional Officer Corps',10),
  ('army-proper-heritage','ARMY','정통 군사전통','Proper Heritage',20),
  ('army-elevated-engineering-corps','ARMY','공병단 강화','Elevated Engineering Corps',30),
  ('army-quick-improvisation','ARMY','신속한 임기응변','Quick Improvisation',40),
  ('army-relief-of-command','ARMY','지휘관 교체','Relief of Command',50),
  ('army-ideological-loyalty','ARMY','사상적 충성','Ideological Loyalty',60),
  ('army-state-serves-military','ARMY','국가는 군에 봉사한다','State Serves the Military',70),
  ('army-tip-of-the-spear','ARMY','창끝','Tip of the Spear',80),
  ('army-overwhelming-firepower','ARMY','압도적 화력','Overwhelming Firepower',90),
  ('army-bayonet-strength','ARMY','총검의 힘','Bayonet Strength',100),
  ('army-motorization-drive','ARMY','차량화 추진','Motorization Drive',110),
  ('division-static-warfare','DIVISION_COMMAND','정적 전쟁','Static Warfare',10),
  ('division-flexible-organization','DIVISION_COMMAND','유연한 조직','Flexible Organization',20),
  ('division-aggressive-reconnaissance','DIVISION_COMMAND','적극적 정찰','Aggressive Reconnaissance',30),
  ('division-reserve-officers','DIVISION_COMMAND','예비 장교','Reserve Officers',40),
  ('division-victory-or-death','DIVISION_COMMAND','승리 아니면 죽음','Victory or Death',50),
  ('division-logistical-focus','DIVISION_COMMAND','병참 중시','Logistical Focus',60),
  ('division-smoke-and-fire','DIVISION_COMMAND','연기와 화염','Smoke and Fire',70),
  ('division-operational-reserves','DIVISION_COMMAND','작전 예비대','Operational Reserves',80),
  ('division-maneuver-warfare','DIVISION_COMMAND','기동전','Maneuver Warfare',90)
on conflict (key) do update set
  category = excluded.category,
  display_name_ko = excluded.display_name_ko,
  source_name = excluded.source_name,
  sort_order = excluded.sort_order;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'civil_war_spectrums','ideology_categories','political_party_ideology_categories','country_ideology_support',
    'grand_doctrines','grand_doctrine_effects','officer_spirits','officer_spirit_effects',
    'military_requirement_groups','military_requirements','country_officer_corps',
    'country_officer_spirit_history','country_grand_doctrine_history','country_military_admin_flags','country_military_resources',
    'military_templates','military_land_units','military_fleets','military_vessels','military_air_wings','military_creation_queues',
    'military_conflicts','military_conflict_sides','military_conflict_participants','military_fronts',
    'military_actions','military_action_assignments','military_action_resolutions','military_occupations','military_war_reports',
    'military_notifications','military_audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
  end loop;
end $$;

create policy "public military doctrine catalog" on public.grand_doctrines
  for select to anon, authenticated using (enabled = true);
create policy "public officer spirit catalog" on public.officer_spirits
  for select to anon, authenticated using (enabled = true);
create policy "public doctrine effects" on public.grand_doctrine_effects
  for select to anon, authenticated using (true);
create policy "public officer spirit effects" on public.officer_spirit_effects
  for select to anon, authenticated using (true);
create policy "public military templates" on public.military_templates
  for select to anon, authenticated using (active = true);
create policy "public conflicts" on public.military_conflicts
  for select to anon, authenticated using (status <> 'DRAFT');
create policy "public conflict sides" on public.military_conflict_sides
  for select to anon, authenticated using (true);
create policy "public conflict participants" on public.military_conflict_participants
  for select to anon, authenticated using (true);
create policy "public war reports" on public.military_war_reports
  for select to anon, authenticated using (visibility = 'PUBLIC');

create index if not exists military_requirements_group_idx on public.military_requirements(requirement_group_id, sort_order);
create index if not exists officer_spirits_category_idx on public.officer_spirits(category, sort_order);
create index if not exists military_conflicts_status_idx on public.military_conflicts(status);
create index if not exists military_actions_country_idx on public.military_actions(country_key, status);
create index if not exists military_units_country_idx on public.military_land_units(country_key, status);
create index if not exists military_queue_country_idx on public.military_creation_queues(country_key, status);
create index if not exists military_notifications_country_idx on public.military_notifications(country_key, read_at);
create index if not exists country_ideology_support_country_idx on public.country_ideology_support(country_key);

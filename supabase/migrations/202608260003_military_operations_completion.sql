alter table public.military_occupations
  add column if not exists province_ids jsonb not null default '[]'::jsonb;

update public.military_occupations
set province_ids = geometry -> 'provinceIds'
where jsonb_typeof(geometry) = 'object'
  and jsonb_typeof(geometry -> 'provinceIds') = 'array'
  and province_ids = '[]'::jsonb;

alter table public.military_occupations
  drop constraint if exists military_occupations_province_ids_array;

alter table public.military_occupations
  add constraint military_occupations_province_ids_array
  check (jsonb_typeof(province_ids) = 'array');

create index if not exists military_occupations_active_conflict_idx
  on public.military_occupations (conflict_id, status)
  where status = 'ACTIVE_OCCUPATION';

create index if not exists military_actions_review_queue_idx
  on public.military_actions (conflict_id, front_id, status, created_at)
  where status in ('SUBMITTED', 'UNDER_REVIEW');

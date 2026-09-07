-- Formation requests reserve resources and create the queue in one transaction.
create or replace function public.tlr_queue_military_force(
  p_country text, p_template uuid, p_name text, p_key text, p_actor text,
  p_version integer, p_available_manpower integer, p_available_capacity numeric
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t public.military_templates%rowtype;
  r public.country_military_resources%rowtype;
  q public.military_creation_queues%rowtype;
  d date;
  m integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('military:' || p_country, 0));
  select * into q from public.military_creation_queues where country_key=p_country and idempotency_key=p_key;
  if found then return to_jsonb(q); end if;
  select * into t from public.military_templates where id=p_template and active for share;
  m := case when t.force_kind='VESSEL' then t.crew_required else t.manpower_required end;
  if t.id is null or t.configuration_status <> 'READY' or m is null or m < 0
    or t.production_capacity_required is null or t.production_capacity_required < 0
    or t.formation_days is null or t.formation_days < 1 then
    raise exception 'TEMPLATE_COSTS_UNCONFIGURED';
  end if;
  select * into r from public.country_military_resources where country_key=p_country for update;
  if coalesce(r.version,0) <> p_version then raise exception 'MILITARY_RESOURCE_CONFLICT'; end if;
  if p_available_manpower is null or p_available_manpower < m then raise exception 'INSUFFICIENT_MANPOWER'; end if;
  if p_available_capacity is null or p_available_capacity-coalesce(r.reserved_production_capacity,0) < t.production_capacity_required then
    raise exception 'INSUFFICIENT_PRODUCTION_CAPACITY';
  end if;
  if nullif(trim(p_name),'') is null or length(p_name)>80 or nullif(p_key,'') is null then raise exception 'INVALID_FORCE_REQUEST'; end if;
  select current_world_date into strict d from public.world_state where singleton=true;
  insert into public.country_military_resources(country_key,available_manpower,reserved_manpower,reserved_production_capacity,version)
    values(p_country,p_available_manpower,m,t.production_capacity_required,1)
  on conflict(country_key) do update set reserved_manpower=country_military_resources.reserved_manpower+m,
    reserved_production_capacity=country_military_resources.reserved_production_capacity+t.production_capacity_required,
    version=country_military_resources.version+1,updated_at=now();
  insert into public.military_creation_queues(country_key,template_id,force_kind,requested_name,status,
    manpower_reserved,production_capacity_reserved,requested_world_date,completion_world_date,idempotency_key,requested_by)
    values(p_country,t.id,t.force_kind,p_name,'IN_PROGRESS',m,t.production_capacity_required,d,d+t.formation_days,p_key,p_actor)
    returning * into q;
  return to_jsonb(q);
end $$;
revoke all on function public.tlr_queue_military_force(text,uuid,text,text,text,integer,integer,numeric) from public,anon,authenticated;
grant execute on function public.tlr_queue_military_force(text,uuid,text,text,text,integer,integer,numeric) to service_role;

-- Only an actual world-date advance completes formations. A turn change or UI read does not.
create or replace function public.tlr_complete_military_formations()
returns trigger language plpgsql security definer set search_path = public as $$
declare q public.military_creation_queues%rowtype;
begin
  if new.current_world_date <= old.current_world_date then return new; end if;
  for q in select * from public.military_creation_queues
    where status in ('QUEUED','IN_PROGRESS') and completion_world_date <= new.current_world_date
    order by country_key,id for update
  loop
    if q.force_kind='LAND_UNIT' then
      insert into public.military_land_units(country_key,display_name,template_id,current_manpower,max_manpower,status,created_world_date,completed_world_date)
      values(q.country_key,q.requested_name,q.template_id,q.manpower_reserved,q.manpower_reserved,'ACTIVE',q.requested_world_date,q.completion_world_date);
    elsif q.force_kind='VESSEL' then
      insert into public.military_vessels(country_key,display_name,template_id,status,laid_down_world_date,commissioned_world_date)
      values(q.country_key,q.requested_name,q.template_id,'ACTIVE',q.requested_world_date,q.completion_world_date);
    elsif q.force_kind='AIR_WING' then
      insert into public.military_air_wings(country_key,display_name,template_id,current_personnel,max_personnel,status,created_world_date,completed_world_date)
      values(q.country_key,q.requested_name,q.template_id,q.manpower_reserved,q.manpower_reserved,'ACTIVE',q.requested_world_date,q.completion_world_date);
    end if;
    update public.country_military_resources set reserved_manpower=reserved_manpower-q.manpower_reserved,
      reserved_production_capacity=reserved_production_capacity-q.production_capacity_reserved,version=version+1,updated_at=now()
      where country_key=q.country_key;
    update public.military_creation_queues set status='COMPLETED',version=version+1 where id=q.id;
  end loop;
  return new;
end $$;
revoke all on function public.tlr_complete_military_formations() from public,anon,authenticated;
grant execute on function public.tlr_complete_military_formations() to service_role;
create trigger military_formation_world_date after update of current_world_date on public.world_state
  for each row execute function public.tlr_complete_military_formations();

create or replace view public.station_access_overview as
select
  s.id as station_id,
  r.id as reservation_id,
  r.user_id as reservation_user_id,
  ac.id as access_code_id,
  (r.id is not null) as has_reservation,
  (ac.id is not null) as has_access_code
from public.stations s
left join lateral (
  select reservation.id, reservation.user_id
  from public.reservations reservation
  where reservation.station_id = s.id
    and reservation.status in ('confirmed', 'checked_in')
    and timezone('utc', now()) between reservation.starts_at and reservation.ends_at
  order by reservation.starts_at
  limit 1
) r on true
left join lateral (
  select code.id
  from public.access_codes code
  where (code.station_id is null or code.station_id = s.id)
    and code.disabled_at is null
    and timezone('utc', now()) between code.valid_from and code.valid_until
    and (code.max_uses is null or code.used_count < code.max_uses)
  order by code.valid_until
  limit 1
) ac on true;

create or replace function public.can_access_station(station_uuid uuid, provided_code_hash text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  station_org_id uuid;
  active_reservation_id uuid;
  valid_code_id uuid;
  membership_role public.membership_role;
begin
  select organization_id into station_org_id
  from public.stations
  where id = station_uuid;

  if station_org_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'station_not_found');
  end if;

  select r.id into active_reservation_id
  from public.reservations r
  where r.station_id = station_uuid
    and r.user_id = auth.uid()
    and r.status in ('confirmed', 'checked_in')
    and timezone('utc', now()) between r.starts_at and r.ends_at
  limit 1;

  if active_reservation_id is not null then
    return jsonb_build_object('allowed', true, 'reason', 'reservation', 'reservation_id', active_reservation_id);
  end if;

  if provided_code_hash is not null then
    select ac.id into valid_code_id
    from public.access_codes ac
    where (ac.station_id is null or ac.station_id = station_uuid)
      and ac.organization_id = station_org_id
      and ac.code_hash = provided_code_hash
      and ac.disabled_at is null
      and timezone('utc', now()) between ac.valid_from and ac.valid_until
      and (ac.max_uses is null or ac.used_count < ac.max_uses)
    limit 1;

    if valid_code_id is not null then
      return jsonb_build_object('allowed', true, 'reason', 'access_code', 'access_code_id', valid_code_id);
    end if;
  end if;

  select public.current_role_for_org(station_org_id) into membership_role;
  if membership_role in ('station_admin', 'org_admin', 'super_admin') and public.has_station_scope(station_uuid) then
    return jsonb_build_object('allowed', true, 'reason', 'admin_override');
  end if;

  return jsonb_build_object('allowed', false, 'reason', 'no_access');
end;
$$;

create or replace function public.start_station_session(
  station_uuid uuid,
  reservation_uuid uuid default null,
  access_code_uuid uuid default null,
  admin_override_value boolean default false,
  estimated_minutes_value integer default 120
)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  station_org_id uuid;
  inserted_session public.sessions;
begin
  select organization_id into station_org_id
  from public.stations
  where id = station_uuid;

  insert into public.sessions (
    organization_id,
    station_id,
    user_id,
    reservation_id,
    access_code_id,
    started_at,
    estimated_end_at,
    state,
    admin_override
  )
  values (
    station_org_id,
    station_uuid,
    auth.uid(),
    reservation_uuid,
    access_code_uuid,
    timezone('utc', now()),
    timezone('utc', now()) + make_interval(mins => estimated_minutes_value),
    'active',
    admin_override_value
  )
  returning * into inserted_session;

  return inserted_session;
end;
$$;

create or replace function public.end_station_session(session_uuid uuid)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_session public.sessions;
begin
  update public.sessions
  set
    actual_end_at = timezone('utc', now()),
    ended_by = auth.uid(),
    state = 'ended'
  where id = session_uuid
  returning * into updated_session;

  return updated_session;
end;
$$;

grant select on public.station_access_overview to authenticated;
grant execute on function public.can_access_station(uuid, text) to authenticated;
grant execute on function public.start_station_session(uuid, uuid, uuid, boolean, integer) to authenticated;
grant execute on function public.end_station_session(uuid) to authenticated;

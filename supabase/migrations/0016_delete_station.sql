-- Hard-delete a station row. Cascades through reservations, sessions,
-- access_codes, and session_history thanks to the ON DELETE CASCADE /
-- ON DELETE SET NULL foreign keys defined in migration 0001.
-- Only org_admin for the station's organization (or a super_admin) can
-- perform this operation.

create or replace function public.delete_station(station_uuid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  station_row public.stations;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into station_row from public.stations where id = station_uuid;
  if station_row.id is null then
    raise exception 'Station not found';
  end if;

  if public.current_role_for_org(station_row.organization_id) not in ('org_admin', 'super_admin')
     and not public.is_super_admin() then
    raise exception 'Not authorized';
  end if;

  perform public.record_audit_event(
    station_row.organization_id,
    'station_deleted',
    'station',
    station_uuid,
    station_uuid,
    jsonb_build_object('name', station_row.name, 'station_code', station_row.station_code)
  );

  delete from public.stations where id = station_uuid;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.delete_station(uuid) to authenticated;

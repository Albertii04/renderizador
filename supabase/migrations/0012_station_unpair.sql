-- Allow admins to unpair a station from mobile. Clears paired_at + rotates station_secret
-- so any locally cached credentials on the desktop become invalid.

create or replace function public.unpair_station(station_uuid uuid)
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

  update public.stations
    set paired_at = null,
        pairing_code_hash = null,
        pairing_expires_at = null,
        metadata = coalesce(metadata, '{}'::jsonb)
          || jsonb_build_object('station_secret', encode(gen_random_bytes(16), 'hex')),
        updated_at = now()
    where id = station_uuid;

  perform public.record_audit_event(
    station_row.organization_id,
    'station_unpaired',
    'station',
    station_uuid,
    station_uuid,
    '{}'::jsonb
  );

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.unpair_station(uuid) to authenticated;

-- Desktop (server mode, anon) polls this to detect remote unpair. Validates the station_secret
-- so arbitrary callers can't probe pairing state.
create or replace function public.check_station_pairing(
  station_uuid uuid,
  station_secret_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  station_row public.stations;
  stored_secret text;
begin
  select * into station_row from public.stations where id = station_uuid;
  if station_row.id is null then
    return jsonb_build_object('paired', false, 'reason', 'not_found');
  end if;

  stored_secret := coalesce(station_row.metadata ->> 'station_secret', '');
  if stored_secret <> coalesce(station_secret_input, '') then
    return jsonb_build_object('paired', false, 'reason', 'secret_mismatch');
  end if;

  return jsonb_build_object('paired', station_row.paired_at is not null);
end;
$$;

grant execute on function public.check_station_pairing(uuid, text) to anon, authenticated;

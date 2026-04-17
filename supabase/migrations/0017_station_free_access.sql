-- Free-access mode: when enabled the desktop station bypasses kiosk lock and
-- the gatekeeper access-code screen, allowing admins to use the machine as if
-- the app was not installed (for testing / troubleshooting).

alter table public.stations
  add column if not exists free_access boolean not null default false;

-- Extend claim_station_pairing to return free_access so the desktop receives
-- the flag on initial pairing without a separate round trip.
create or replace function public.claim_station_pairing(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  station_row public.stations;
  station_secret text;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    raise exception 'invalid_code';
  end if;

  select * into station_row
    from public.stations
    where pairing_code_hash = public.generate_access_code(upper(trim(p_code)))
      and pairing_expires_at > now()
      and paired_at is null
    limit 1;

  if station_row.id is null then
    raise exception 'invalid_or_expired_code';
  end if;

  update public.stations
    set pairing_code_hash = null,
        pairing_expires_at = null,
        paired_at = now(),
        updated_at = now()
    where id = station_row.id;

  perform public.record_audit_event(
    station_row.organization_id,
    'station_paired',
    'station',
    station_row.id,
    station_row.id,
    jsonb_build_object('station_code', station_row.station_code)
  );

  station_secret := coalesce((station_row.metadata ->> 'station_secret'), '');

  return jsonb_build_object(
    'ok', true,
    'station_id', station_row.id,
    'station_code', station_row.station_code,
    'station_name', station_row.name,
    'organization_id', station_row.organization_id,
    'station_secret', station_secret,
    'free_access', station_row.free_access,
    'metadata', station_row.metadata
  );
end;
$$;

grant execute on function public.claim_station_pairing(text) to anon, authenticated;

-- Extend check_station_pairing so the desktop (polls every 15s) picks up
-- free_access toggles made by the admin from the mobile app.
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

  return jsonb_build_object(
    'paired', station_row.paired_at is not null,
    'free_access', station_row.free_access
  );
end;
$$;

grant execute on function public.check_station_pairing(uuid, text) to anon, authenticated;

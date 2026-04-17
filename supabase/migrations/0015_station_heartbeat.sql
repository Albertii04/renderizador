-- Lets the desktop client (server mode, anon) write a lightweight "I'm alive"
-- ping that the mobile admin UI can read to show an online indicator. The
-- station_secret acts as the auth token so arbitrary anon callers can't spoof
-- heartbeats for a station they don't own.

create or replace function public.station_heartbeat(
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
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  stored_secret := coalesce(station_row.metadata ->> 'station_secret', '');
  if stored_secret <> coalesce(station_secret_input, '') then
    return jsonb_build_object('ok', false, 'reason', 'secret_mismatch');
  end if;

  update public.stations
    set metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('last_seen_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
    where id = station_uuid;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.station_heartbeat(uuid, text) to anon, authenticated;

-- Station pairing: mobile admin creates a station, desktop claims it by entering a one-time code.

alter table public.stations
  add column if not exists pairing_code_hash text,
  add column if not exists pairing_expires_at timestamptz,
  add column if not exists paired_at timestamptz;

create unique index if not exists stations_pairing_code_hash_key
  on public.stations(pairing_code_hash)
  where pairing_code_hash is not null;

-- Admin generates (or regenerates) a pairing code for a station.
-- Requires caller to be org admin / super admin via RLS on stations.
create or replace function public.generate_station_pairing_code(
  station_uuid uuid,
  ttl_minutes integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  station_row public.stations;
  plain_code text;
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

  plain_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));

  update public.stations
    set pairing_code_hash = public.generate_access_code(plain_code),
        pairing_expires_at = now() + make_interval(mins => coalesce(ttl_minutes, 15)),
        paired_at = null,
        updated_at = now()
    where id = station_uuid;

  perform public.record_audit_event(
    station_row.organization_id,
    'station_pairing_code_issued',
    'station',
    station_uuid,
    station_uuid,
    jsonb_build_object('ttl_minutes', coalesce(ttl_minutes, 15))
  );

  return jsonb_build_object(
    'ok', true,
    'plain_code', plain_code,
    'expires_at', now() + make_interval(mins => coalesce(ttl_minutes, 15))
  );
end;
$$;

grant execute on function public.generate_station_pairing_code(uuid, integer) to authenticated;

-- Desktop calls this with anon key to claim a station. Returns runtime config + station_secret.
-- Single-use: clears hash on success.
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
    'metadata', station_row.metadata
  );
end;
$$;

grant execute on function public.claim_station_pairing(text) to anon, authenticated;

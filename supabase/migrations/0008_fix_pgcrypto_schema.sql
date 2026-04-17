create schema if not exists extensions;
create extension if not exists pgcrypto;

create or replace function public.generate_access_code(raw_code text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(digest(raw_code, 'sha256'), 'hex');
$$;

create or replace function public.create_reservation_with_code(
  station_uuid uuid,
  starts_at_input timestamptz,
  ends_at_input timestamptz,
  estimated_minutes_input integer,
  project_name_input text default null,
  work_type_input text default null,
  buffer_minutes_input integer default 15,
  instructions_input text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  station_row public.stations;
  conflict_row public.reservations;
  inserted_reservation public.reservations;
  inserted_code public.access_codes;
  plain_code text;
  effective_instructions text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into station_row
  from public.stations
  where id = station_uuid
    and enabled = true;

  if station_row.id is null then
    raise exception 'Station not found';
  end if;

  if ends_at_input <= starts_at_input then
    raise exception 'Reservation end must be after start';
  end if;

  select *
  into conflict_row
  from public.find_reservation_conflict(station_uuid, starts_at_input, ends_at_input);

  if conflict_row.id is not null then
    return jsonb_build_object(
      'ok', false,
      'message', 'Reservation conflict detected',
      'conflict', row_to_json(conflict_row)
    );
  end if;

  effective_instructions := coalesce(instructions_input, station_row.metadata ->> 'instructions', 'Arrive on time and unlock the station using your reservation or access code.');

  insert into public.reservations (
    organization_id,
    station_id,
    user_id,
    starts_at,
    ends_at,
    estimated_minutes,
    status,
    project_name,
    work_type,
    buffer_minutes,
    instructions
  )
  values (
    station_row.organization_id,
    station_uuid,
    auth.uid(),
    starts_at_input,
    ends_at_input,
    estimated_minutes_input,
    'confirmed',
    project_name_input,
    work_type_input,
    buffer_minutes_input,
    effective_instructions
  )
  returning * into inserted_reservation;

  plain_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));

  insert into public.access_codes (
    organization_id,
    station_id,
    reservation_id,
    code_hash,
    valid_from,
    valid_until,
    max_uses,
    used_count,
    created_by
  )
  values (
    station_row.organization_id,
    station_uuid,
    inserted_reservation.id,
    public.generate_access_code(plain_code),
    starts_at_input - make_interval(mins => greatest(buffer_minutes_input, 0)),
    ends_at_input + make_interval(mins => greatest(buffer_minutes_input, 0)),
    1,
    0,
    auth.uid()
  )
  returning * into inserted_code;

  perform public.record_audit_event(
    station_row.organization_id,
    'reservation_created',
    'reservation',
    inserted_reservation.id,
    station_uuid,
    jsonb_build_object('project_name', project_name_input, 'work_type', work_type_input)
  );

  return jsonb_build_object(
    'ok', true,
    'reservation', row_to_json(inserted_reservation),
    'access_code', jsonb_build_object(
      'id', inserted_code.id,
      'plain_code', plain_code,
      'valid_from', inserted_code.valid_from,
      'valid_until', inserted_code.valid_until
    ),
    'instructions', effective_instructions
  );
end;
$$;

create or replace function public.create_admin_access_code(
  station_uuid uuid,
  valid_from_input timestamptz,
  valid_until_input timestamptz,
  max_uses_input integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  station_row public.stations;
  inserted_code public.access_codes;
  plain_code text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into station_row
  from public.stations
  where id = station_uuid;

  if station_row.id is null then
    raise exception 'Station not found';
  end if;

  plain_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));

  insert into public.access_codes (
    organization_id,
    station_id,
    code_hash,
    valid_from,
    valid_until,
    max_uses,
    used_count,
    created_by
  )
  values (
    station_row.organization_id,
    station_uuid,
    public.generate_access_code(plain_code),
    valid_from_input,
    valid_until_input,
    max_uses_input,
    0,
    auth.uid()
  )
  returning * into inserted_code;

  perform public.record_audit_event(
    station_row.organization_id,
    'access_code_created',
    'access_code',
    inserted_code.id,
    station_uuid,
    jsonb_build_object('max_uses', max_uses_input)
  );

  return jsonb_build_object(
    'ok', true,
    'access_code', row_to_json(inserted_code),
    'plain_code', plain_code
  );
end;
$$;

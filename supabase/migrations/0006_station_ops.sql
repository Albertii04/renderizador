alter table public.reservations
  add column if not exists project_name text,
  add column if not exists work_type text,
  add column if not exists buffer_minutes integer not null default 15 check (buffer_minutes >= 0),
  add column if not exists instructions text;

alter table public.access_codes
  add column if not exists reservation_id uuid references public.reservations(id) on delete cascade;

alter table public.sessions
  add column if not exists revoked_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists termination_reason text;

create index if not exists reservations_station_status_window_idx
  on public.reservations (station_id, status, starts_at, ends_at);

create index if not exists sessions_station_active_idx
  on public.sessions (station_id, state, actual_end_at, revoked_at);

create or replace function public.record_audit_event(
  organization_uuid uuid,
  action_name text,
  entity_type_name text,
  entity_uuid uuid default null,
  station_uuid uuid default null,
  metadata_payload jsonb default '{}'::jsonb
)
returns public.audit_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_log public.audit_logs;
begin
  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    station_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    organization_uuid,
    auth.uid(),
    station_uuid,
    action_name,
    entity_type_name,
    entity_uuid,
    metadata_payload
  )
  returning * into inserted_log;

  return inserted_log;
end;
$$;

create or replace function public.find_reservation_conflict(
  station_uuid uuid,
  starts_at_input timestamptz,
  ends_at_input timestamptz,
  ignore_reservation_uuid uuid default null
)
returns public.reservations
language sql
stable
set search_path = public
as $$
  select reservation.*
  from public.reservations reservation
  where reservation.station_id = station_uuid
    and reservation.status in ('confirmed', 'checked_in')
    and (ignore_reservation_uuid is null or reservation.id <> ignore_reservation_uuid)
    and tstzrange(reservation.starts_at, reservation.ends_at, '[)') &&
        tstzrange(starts_at_input, ends_at_input, '[)')
  order by reservation.starts_at
  limit 1;
$$;

create or replace function public.generate_access_code(raw_code text)
returns text
language sql
immutable
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
set search_path = public
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

create or replace function public.next_station_reservation(station_uuid uuid)
returns public.reservations
language sql
stable
set search_path = public
as $$
  select reservation.*
  from public.reservations reservation
  where reservation.station_id = station_uuid
    and reservation.status in ('confirmed', 'checked_in')
    and reservation.ends_at > timezone('utc', now())
  order by reservation.starts_at
  limit 1;
$$;

create or replace function public.list_station_catalog()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'station', row_to_json(station),
      'active_session', (
        select row_to_json(session_row)
        from public.sessions session_row
        where session_row.station_id = station.id
          and session_row.state in ('active', 'warning')
          and session_row.actual_end_at is null
          and session_row.revoked_at is null
        order by session_row.started_at desc
        limit 1
      ),
      'next_reservation', (
        select row_to_json(reservation)
        from public.reservations reservation
        where reservation.station_id = station.id
          and reservation.status in ('confirmed', 'checked_in')
          and reservation.ends_at > timezone('utc', now())
        order by reservation.starts_at
        limit 1
      )
    )
  ), '[]'::jsonb)
  into payload
  from public.stations station
  where station.enabled = true
    and (
      public.is_super_admin()
      or exists (
        select 1
        from public.memberships membership
        where membership.organization_id = station.organization_id
          and membership.user_id = auth.uid()
      )
    );

  return payload;
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
set search_path = public
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

create or replace function public.get_station_by_code(station_code_input text)
returns public.stations
language sql
security definer
set search_path = public
stable
as $$
  select s.*
  from public.stations s
  where s.station_code = station_code_input
    and s.enabled = true
  limit 1;
$$;

drop function if exists public.get_active_station_session(uuid);
create or replace function public.get_active_station_session(station_uuid uuid, station_secret_input text default null)
returns public.sessions
language sql
security definer
set search_path = public
stable
as $$
  select s.*
  from public.sessions s
  join public.stations station on station.id = s.station_id
  where s.station_id = station_uuid
    and s.state in ('active', 'warning')
    and s.actual_end_at is null
    and s.revoked_at is null
    and (
      auth.uid() is not null
      or (
        station_secret_input is not null
        and coalesce(station.metadata ->> 'station_secret', '') = station_secret_input
      )
    )
  order by s.started_at desc
  limit 1;
$$;

drop function if exists public.can_access_station(uuid, text);
create or replace function public.can_access_station(
  station_uuid uuid,
  provided_code_hash text default null,
  station_secret_input text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  station_row public.stations;
  active_reservation_row public.reservations;
  valid_code_row public.access_codes;
  membership_role public.membership_role;
  next_reservation_row public.reservations;
begin
  select *
  into station_row
  from public.stations
  where id = station_uuid
    and enabled = true;

  if station_row.id is null then
    return jsonb_build_object('allowed', false, 'reason', 'station_not_found', 'failed_attempts_remaining', 0);
  end if;

  if auth.uid() is null and station_secret_input is null then
    return jsonb_build_object('allowed', false, 'reason', 'authentication_required', 'failed_attempts_remaining', 4);
  end if;

  if station_secret_input is not null and coalesce(station_row.metadata ->> 'station_secret', '') <> station_secret_input then
    return jsonb_build_object('allowed', false, 'reason', 'authentication_required', 'failed_attempts_remaining', 4);
  end if;

  select *
  into next_reservation_row
  from public.next_station_reservation(station_uuid);

  if auth.uid() is not null then
    select reservation.*
    into active_reservation_row
    from public.reservations reservation
    where reservation.station_id = station_uuid
      and reservation.user_id = auth.uid()
      and reservation.status in ('confirmed', 'checked_in')
      and timezone('utc', now()) between reservation.starts_at - make_interval(mins => reservation.buffer_minutes)
        and reservation.ends_at + make_interval(mins => reservation.buffer_minutes)
    order by reservation.starts_at
    limit 1;

    if active_reservation_row.id is not null then
      return jsonb_build_object(
        'allowed', true,
        'reason', 'reservation',
        'reservation_id', active_reservation_row.id,
        'failed_attempts_remaining', 5,
        'next_reservation', row_to_json(next_reservation_row)
      );
    end if;
  end if;

  if provided_code_hash is not null then
    select code.*
    into valid_code_row
    from public.access_codes code
    where (code.station_id is null or code.station_id = station_uuid)
      and code.organization_id = station_row.organization_id
      and code.code_hash = provided_code_hash
      and code.disabled_at is null
      and timezone('utc', now()) between code.valid_from and code.valid_until
      and (code.max_uses is null or code.used_count < code.max_uses)
    limit 1;

    if valid_code_row.id is not null then
      return jsonb_build_object(
        'allowed', true,
        'reason', 'access_code',
        'reservation_id', valid_code_row.reservation_id,
        'access_code_id', valid_code_row.id,
        'failed_attempts_remaining', 5,
        'next_reservation', row_to_json(next_reservation_row)
      );
    end if;
  end if;

  if auth.uid() is not null then
    select public.current_role_for_org(station_row.organization_id)
    into membership_role;

    if membership_role in ('station_admin', 'org_admin', 'super_admin') and public.has_station_scope(station_uuid) then
      return jsonb_build_object(
        'allowed', true,
        'reason', 'admin_override',
        'failed_attempts_remaining', 5,
        'next_reservation', row_to_json(next_reservation_row)
      );
    end if;
  end if;

  perform public.record_audit_event(
    station_row.organization_id,
    'access_denied',
    'station',
    station_uuid,
    station_uuid,
    jsonb_build_object('code_attempt', provided_code_hash is not null)
  );

  return jsonb_build_object(
    'allowed', false,
    'reason', 'no_access',
    'failed_attempts_remaining', 4,
    'next_reservation', row_to_json(next_reservation_row)
  );
end;
$$;

drop function if exists public.start_station_session(uuid, uuid, uuid, boolean, integer);
create or replace function public.start_station_session(
  station_uuid uuid,
  reservation_uuid uuid default null,
  access_code_uuid uuid default null,
  admin_override_value boolean default false,
  estimated_minutes_value integer default 120,
  station_secret_input text default null
)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  station_row public.stations;
  active_session public.sessions;
  inserted_session public.sessions;
begin
  if auth.uid() is null and station_secret_input is null then
    raise exception 'Authentication required';
  end if;

  select *
  into station_row
  from public.stations
  where id = station_uuid;

  if station_row.id is null then
    raise exception 'Station not found';
  end if;

  if station_secret_input is not null and coalesce(station_row.metadata ->> 'station_secret', '') <> station_secret_input then
    raise exception 'Invalid station secret';
  end if;

  select *
  into active_session
  from public.sessions session_row
  where session_row.station_id = station_uuid
    and session_row.state in ('active', 'warning')
    and session_row.actual_end_at is null
    and session_row.revoked_at is null
  order by session_row.started_at desc
  limit 1;

  if active_session.id is not null then
    raise exception 'Station already has an active session';
  end if;

  insert into public.sessions (
    organization_id,
    station_id,
    user_id,
    reservation_id,
    access_code_id,
    started_at,
    estimated_end_at,
    last_heartbeat_at,
    state,
    admin_override
  )
  values (
    station_row.organization_id,
    station_uuid,
    auth.uid(),
    reservation_uuid,
    access_code_uuid,
    timezone('utc', now()),
    timezone('utc', now()) + make_interval(mins => estimated_minutes_value),
    timezone('utc', now()),
    'active',
    admin_override_value
  )
  returning * into inserted_session;

  if access_code_uuid is not null then
    update public.access_codes
    set used_count = used_count + 1
    where id = access_code_uuid;
  end if;

  if reservation_uuid is not null then
    update public.reservations
    set status = 'checked_in'
    where id = reservation_uuid;
  end if;

  perform public.record_audit_event(
    station_row.organization_id,
    'session_started',
    'session',
    inserted_session.id,
    station_uuid,
    jsonb_build_object('reservation_id', reservation_uuid, 'access_code_id', access_code_uuid, 'admin_override', admin_override_value)
  );

  return inserted_session;
end;
$$;

drop function if exists public.end_station_session(uuid);
create or replace function public.end_station_session(session_uuid uuid, station_secret_input text default null)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_session public.sessions;
begin
  if auth.uid() is null and station_secret_input is null then
    raise exception 'Authentication required';
  end if;

  update public.sessions
  set
    actual_end_at = timezone('utc', now()),
    ended_by = auth.uid(),
    state = 'ended',
    termination_reason = coalesce(termination_reason, 'user_end')
  where id = session_uuid
  returning * into updated_session;

  if updated_session.id is null then
    raise exception 'Session not found';
  end if;

  perform public.record_audit_event(
    updated_session.organization_id,
    'session_ended',
    'session',
    updated_session.id,
    updated_session.station_id,
    jsonb_build_object('termination_reason', updated_session.termination_reason)
  );

  return updated_session;
end;
$$;

create or replace function public.revoke_station_session(
  session_uuid uuid,
  reason_input text default 'revoked_by_admin'
)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_session public.sessions;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.sessions
  set
    revoked_at = timezone('utc', now()),
    actual_end_at = coalesce(actual_end_at, timezone('utc', now())),
    ended_by = auth.uid(),
    state = 'ended',
    termination_reason = reason_input
  where id = session_uuid
  returning * into updated_session;

  if updated_session.id is null then
    raise exception 'Session not found';
  end if;

  perform public.record_audit_event(
    updated_session.organization_id,
    'session_revoked',
    'session',
    updated_session.id,
    updated_session.station_id,
    jsonb_build_object('termination_reason', reason_input)
  );

  return updated_session;
end;
$$;

create or replace function public.extend_station_session(
  session_uuid uuid,
  extra_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.sessions;
  next_reservation_row public.reservations;
  next_end_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into session_row
  from public.sessions
  where id = session_uuid;

  if session_row.id is null then
    raise exception 'Session not found';
  end if;

  next_end_at := coalesce(session_row.estimated_end_at, timezone('utc', now())) + make_interval(mins => greatest(extra_minutes, 1));

  select reservation.*
  into next_reservation_row
  from public.reservations reservation
  where reservation.station_id = session_row.station_id
    and reservation.status in ('confirmed', 'checked_in')
    and reservation.starts_at > session_row.starts_at
  order by reservation.starts_at
  limit 1;

  if next_reservation_row.id is not null and next_end_at > next_reservation_row.starts_at then
    return jsonb_build_object(
      'ok', false,
      'message', 'Extension conflicts with next reservation',
      'next_reservation', row_to_json(next_reservation_row)
    );
  end if;

  update public.sessions
  set estimated_end_at = next_end_at
  where id = session_uuid;

  perform public.record_audit_event(
    session_row.organization_id,
    'session_extended',
    'session',
    session_uuid,
    session_row.station_id,
    jsonb_build_object('extra_minutes', extra_minutes)
  );

  return jsonb_build_object('ok', true, 'estimated_end_at', next_end_at, 'next_reservation', row_to_json(next_reservation_row));
end;
$$;

create or replace function public.station_runtime_snapshot(station_uuid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  station_row public.stations;
  active_session_row public.sessions;
  next_reservation_row public.reservations;
  station_state text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into station_row
  from public.stations
  where id = station_uuid;

  if station_row.id is null then
    return jsonb_build_object('station_state', 'station_unregistered');
  end if;

  select *
  into active_session_row
  from public.sessions session_row
  where session_row.station_id = station_uuid
    and session_row.state in ('active', 'warning')
    and session_row.actual_end_at is null
    and session_row.revoked_at is null
  order by session_row.started_at desc
  limit 1;

  select reservation.*
  into next_reservation_row
  from public.reservations reservation
  where reservation.station_id = station_uuid
    and reservation.status in ('confirmed', 'checked_in')
    and reservation.ends_at > timezone('utc', now())
  order by reservation.starts_at
  limit 1;

  if active_session_row.id is not null then
    station_state := 'active_session';
  else
    station_state := 'locked';
  end if;

  return jsonb_build_object(
    'station', row_to_json(station_row),
    'active_session', row_to_json(active_session_row),
    'next_reservation', row_to_json(next_reservation_row),
    'station_state', station_state
  );
end;
$$;

create or replace function public.station_runtime_snapshot_with_secret(
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
  active_session_row public.sessions;
  next_reservation_row public.reservations;
  station_state text;
begin
  select *
  into station_row
  from public.stations
  where id = station_uuid;

  if station_row.id is null then
    return jsonb_build_object('station_state', 'station_unregistered');
  end if;

  if coalesce(station_row.metadata ->> 'station_secret', '') <> station_secret_input then
    raise exception 'Invalid station secret';
  end if;

  select *
  into active_session_row
  from public.sessions session_row
  where session_row.station_id = station_uuid
    and session_row.state in ('active', 'warning')
    and session_row.actual_end_at is null
    and session_row.revoked_at is null
  order by session_row.started_at desc
  limit 1;

  select reservation.*
  into next_reservation_row
  from public.reservations reservation
  where reservation.station_id = station_uuid
    and reservation.status in ('confirmed', 'checked_in')
    and reservation.ends_at > timezone('utc', now())
  order by reservation.starts_at
  limit 1;

  if active_session_row.id is not null then
    station_state := 'active_session';
  else
    station_state := 'locked';
  end if;

  return jsonb_build_object(
    'station', row_to_json(station_row),
    'active_session', row_to_json(active_session_row),
    'next_reservation', row_to_json(next_reservation_row),
    'station_state', station_state
  );
end;
$$;

revoke execute on function public.get_station_by_code(text) from anon;
revoke execute on function public.get_active_station_session(uuid, text) from authenticated;
revoke execute on function public.can_access_station(uuid, text, text) from authenticated;
revoke execute on function public.start_station_session(uuid, uuid, uuid, boolean, integer, text) from authenticated;
revoke execute on function public.end_station_session(uuid, text) from authenticated;

grant execute on function public.record_audit_event(uuid, text, text, uuid, uuid, jsonb) to authenticated;
grant execute on function public.list_station_catalog() to authenticated;
grant execute on function public.find_reservation_conflict(uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.create_reservation_with_code(uuid, timestamptz, timestamptz, integer, text, text, integer, text) to authenticated;
grant execute on function public.create_admin_access_code(uuid, timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.next_station_reservation(uuid) to authenticated;
grant execute on function public.get_station_by_code(text) to authenticated;
grant execute on function public.get_active_station_session(uuid, text) to anon, authenticated;
grant execute on function public.can_access_station(uuid, text, text) to anon, authenticated;
grant execute on function public.start_station_session(uuid, uuid, uuid, boolean, integer, text) to anon, authenticated;
grant execute on function public.end_station_session(uuid, text) to anon, authenticated;
grant execute on function public.revoke_station_session(uuid, text) to authenticated;
grant execute on function public.extend_station_session(uuid, integer) to authenticated;
grant execute on function public.station_runtime_snapshot(uuid) to authenticated;
grant execute on function public.station_runtime_snapshot_with_secret(uuid, text) to anon, authenticated;

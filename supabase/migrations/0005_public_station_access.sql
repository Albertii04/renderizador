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

create or replace function public.get_active_station_session(station_uuid uuid)
returns public.sessions
language sql
security definer
set search_path = public
stable
as $$
  select s.*
  from public.sessions s
  where s.station_id = station_uuid
    and s.state in ('active', 'warning')
    and s.actual_end_at is null
  order by s.started_at desc
  limit 1;
$$;

grant execute on function public.get_station_by_code(text) to anon, authenticated;
grant execute on function public.get_active_station_session(uuid) to anon, authenticated;
grant execute on function public.can_access_station(uuid, text) to anon, authenticated;
grant execute on function public.start_station_session(uuid, uuid, uuid, boolean, integer) to anon, authenticated;
grant execute on function public.end_station_session(uuid) to anon, authenticated;

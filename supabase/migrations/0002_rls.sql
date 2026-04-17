alter table public.organizations enable row level security;
alter table public.user_profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.stations enable row level security;
alter table public.reservations enable row level security;
alter table public.access_codes enable row level security;
alter table public.sessions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.desktop_release_channels enable row level security;
alter table public.desktop_app_versions enable row level security;

create or replace function public.current_role_for_org(organization_uuid uuid)
returns public.membership_role
language sql
stable
as $$
  select m.role
  from public.memberships m
  where m.organization_id = organization_uuid
    and m.user_id = auth.uid()
  order by array_position(enum_range(null::public.membership_role), m.role) desc
  limit 1;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and role = 'super_admin'
  );
$$;

create or replace function public.has_station_scope(station_uuid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.memberships m
    join public.stations s on s.organization_id = m.organization_id
    where s.id = station_uuid
      and m.user_id = auth.uid()
      and (
        m.role in ('org_admin', 'super_admin')
        or (m.role = 'station_admin' and (m.station_ids is null or station_uuid = any(m.station_ids)))
      )
  );
$$;

create policy "profiles_self_select"
on public.user_profiles
for select
using (id = auth.uid() or public.is_super_admin());

create policy "profiles_self_update"
on public.user_profiles
for update
using (id = auth.uid() or public.is_super_admin())
with check (id = auth.uid() or public.is_super_admin());

create policy "memberships_self_select"
on public.memberships
for select
using (user_id = auth.uid() or public.is_super_admin());

create policy "memberships_admin_manage"
on public.memberships
for all
using (
  public.is_super_admin()
  or public.current_role_for_org(organization_id) in ('org_admin', 'super_admin')
)
with check (
  public.is_super_admin()
  or public.current_role_for_org(organization_id) in ('org_admin', 'super_admin')
);

create policy "organizations_members_read"
on public.organizations
for select
using (
  public.is_super_admin()
  or exists (
    select 1 from public.memberships m
    where m.organization_id = organizations.id and m.user_id = auth.uid()
  )
);

create policy "organizations_admin_manage"
on public.organizations
for all
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "stations_members_read"
on public.stations
for select
using (
  public.is_super_admin()
  or exists (
    select 1 from public.memberships m
    where m.organization_id = stations.organization_id and m.user_id = auth.uid()
  )
);

create policy "stations_admin_manage"
on public.stations
for all
using (
  public.is_super_admin()
  or public.current_role_for_org(organization_id) in ('org_admin', 'super_admin')
  or public.has_station_scope(id)
)
with check (
  public.is_super_admin()
  or public.current_role_for_org(organization_id) in ('org_admin', 'super_admin')
  or public.has_station_scope(id)
);

create policy "reservations_read_own_or_admin"
on public.reservations
for select
using (
  user_id = auth.uid()
  or public.is_super_admin()
  or public.current_role_for_org(organization_id) in ('org_admin', 'super_admin')
  or public.has_station_scope(station_id)
);

create policy "reservations_create_own_or_admin"
on public.reservations
for insert
with check (
  user_id = auth.uid()
  or public.is_super_admin()
  or public.current_role_for_org(organization_id) in ('org_admin', 'super_admin')
  or public.has_station_scope(station_id)
);

create policy "reservations_update_admin"
on public.reservations
for update
using (
  user_id = auth.uid()
  or public.is_super_admin()
  or public.current_role_for_org(organization_id) in ('org_admin', 'super_admin')
  or public.has_station_scope(station_id)
)
with check (
  user_id = auth.uid()
  or public.is_super_admin()
  or public.current_role_for_org(organization_id) in ('org_admin', 'super_admin')
  or public.has_station_scope(station_id)
);

create policy "access_codes_admin_read"
on public.access_codes
for select
using (
  public.is_super_admin()
  or public.current_role_for_org(organization_id) in ('org_admin', 'super_admin')
  or (station_id is not null and public.has_station_scope(station_id))
);

create policy "access_codes_admin_manage"
on public.access_codes
for all
using (
  public.is_super_admin()
  or public.current_role_for_org(organization_id) in ('org_admin', 'super_admin')
  or (station_id is not null and public.has_station_scope(station_id))
)
with check (
  public.is_super_admin()
  or public.current_role_for_org(organization_id) in ('org_admin', 'super_admin')
  or (station_id is not null and public.has_station_scope(station_id))
);

create policy "sessions_read_own_or_admin"
on public.sessions
for select
using (
  user_id = auth.uid()
  or public.is_super_admin()
  or public.current_role_for_org(organization_id) in ('org_admin', 'super_admin')
  or public.has_station_scope(station_id)
);

create policy "sessions_manage_admin"
on public.sessions
for all
using (
  public.is_super_admin()
  or public.current_role_for_org(organization_id) in ('org_admin', 'super_admin')
  or public.has_station_scope(station_id)
)
with check (
  public.is_super_admin()
  or public.current_role_for_org(organization_id) in ('org_admin', 'super_admin')
  or public.has_station_scope(station_id)
);

create policy "audit_logs_admin_read"
on public.audit_logs
for select
using (
  public.is_super_admin()
  or public.current_role_for_org(organization_id) in ('org_admin', 'super_admin')
  or (station_id is not null and public.has_station_scope(station_id))
);

create policy "audit_logs_insert"
on public.audit_logs
for insert
with check (
  actor_user_id = auth.uid()
  or public.is_super_admin()
  or public.current_role_for_org(organization_id) in ('station_admin', 'org_admin', 'super_admin')
);

create policy "release_channels_members_read"
on public.desktop_release_channels
for select
using (
  exists (select 1 from public.memberships m where m.user_id = auth.uid())
  or public.is_super_admin()
);

create policy "release_channels_admin_manage"
on public.desktop_release_channels
for all
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "app_versions_members_read"
on public.desktop_app_versions
for select
using (
  exists (select 1 from public.memberships m where m.user_id = auth.uid())
  or public.is_super_admin()
);

create policy "app_versions_admin_manage"
on public.desktop_app_versions
for all
using (
  public.is_super_admin()
  or exists (
    select 1
    from public.desktop_release_channels channel
    join public.stations station on station.release_channel_id = channel.id
    join public.memberships m on m.organization_id = station.organization_id
    where desktop_app_versions.channel_id = channel.id
      and m.user_id = auth.uid()
      and m.role in ('org_admin', 'super_admin')
  )
)
with check (
  public.is_super_admin()
  or exists (
    select 1
    from public.desktop_release_channels channel
    join public.stations station on station.release_channel_id = channel.id
    join public.memberships m on m.organization_id = station.organization_id
    where desktop_app_versions.channel_id = channel.id
      and m.user_id = auth.uid()
      and m.role in ('org_admin', 'super_admin')
  )
);

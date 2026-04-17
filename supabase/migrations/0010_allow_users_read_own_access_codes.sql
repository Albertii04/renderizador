drop policy if exists "access_codes_admin_read" on public.access_codes;

create policy "access_codes_read_own_or_admin"
on public.access_codes
for select
using (
  exists (
    select 1
    from public.reservations reservation
    where reservation.id = access_codes.reservation_id
      and reservation.user_id = auth.uid()
  )
  or public.is_super_admin()
  or public.current_role_for_org(organization_id) in ('org_admin', 'super_admin')
  or (station_id is not null and public.has_station_scope(station_id))
);

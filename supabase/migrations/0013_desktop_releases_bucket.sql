-- Desktop auto-update artifacts live here.
-- Bucket is public-read so electron-updater can fetch latest.yml + installers
-- with the anon key embedded in the client. Writes require service-role.

insert into storage.buckets (id, name, public)
values ('desktop-releases', 'desktop-releases', true)
on conflict (id) do nothing;

drop policy if exists "desktop-releases public read" on storage.objects;
create policy "desktop-releases public read"
  on storage.objects
  for select
  using (bucket_id = 'desktop-releases');

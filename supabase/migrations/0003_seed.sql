insert into public.desktop_release_channels (id, name, description)
values
  ('00000000-0000-0000-0000-000000000101', 'stable', 'Default production release channel'),
  ('00000000-0000-0000-0000-000000000102', 'beta', 'Pre-release validation channel')
on conflict (name) do update
set description = excluded.description;

insert into public.organizations (id, name, slug)
values ('00000000-0000-0000-0000-000000000201', 'Renderizador Demo Org', 'renderizador-demo')
on conflict (slug) do update
set name = excluded.name;

insert into public.stations (
  id,
  organization_id,
  release_channel_id,
  name,
  slug,
  station_code,
  location,
  enabled,
  metadata
)
values
  (
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000101',
    'Render Station 01',
    'render-station-01',
    'RS-01',
    'Madrid',
    true,
    '{"gpu":"RTX 4090","protocols":["d5","rdp"]}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000302',
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000102',
    'Render Station 02',
    'render-station-02',
    'RS-02',
    'Barcelona',
    true,
    '{"gpu":"RTX 4080","protocols":["rdp"]}'::jsonb
  )
on conflict (organization_id, station_code) do update
set
  name = excluded.name,
  release_channel_id = excluded.release_channel_id,
  location = excluded.location,
  enabled = excluded.enabled,
  metadata = excluded.metadata;

insert into public.desktop_app_versions (
  id,
  channel_id,
  version,
  notes,
  minimum_supported_version,
  rollout_percent,
  published_at
)
values
  (
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000101',
    '0.1.0',
    'Initial MVP stable channel baseline',
    '0.1.0',
    100,
    timezone('utc', now())
  ),
  (
    '00000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000102',
    '0.2.0-beta.1',
    'Beta channel placeholder for desktop updater integration',
    '0.1.0',
    20,
    timezone('utc', now())
  )
on conflict (channel_id, version) do update
set
  notes = excluded.notes,
  minimum_supported_version = excluded.minimum_supported_version,
  rollout_percent = excluded.rollout_percent,
  published_at = excluded.published_at;

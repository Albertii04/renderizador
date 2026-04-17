create extension if not exists pgcrypto;

create type public.membership_role as enum ('user', 'station_admin', 'org_admin', 'super_admin');
create type public.reservation_status as enum ('draft', 'confirmed', 'checked_in', 'completed', 'cancelled');
create type public.session_state as enum ('pending', 'active', 'warning', 'ended');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.desktop_release_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  role public.membership_role not null default 'user',
  station_ids uuid[],
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, user_id)
);

create table public.stations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  release_channel_id uuid references public.desktop_release_channels(id) on delete set null,
  name text not null,
  slug text not null,
  station_code text not null,
  location text,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, slug),
  unique (organization_id, station_code)
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  estimated_minutes integer not null check (estimated_minutes > 0),
  status public.reservation_status not null default 'draft',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at > starts_at)
);

create table public.access_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid references public.stations(id) on delete cascade,
  code_hash text not null,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  disabled_at timestamptz,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (valid_until > valid_from)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  user_id uuid references public.user_profiles(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  access_code_id uuid references public.access_codes(id) on delete set null,
  started_at timestamptz not null default timezone('utc', now()),
  estimated_end_at timestamptz,
  actual_end_at timestamptz,
  warning_sent_at timestamptz,
  ended_by uuid references public.user_profiles(id) on delete set null,
  state public.session_state not null default 'pending',
  admin_override boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references public.user_profiles(id) on delete set null,
  station_id uuid references public.stations(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.desktop_app_versions (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.desktop_release_channels(id) on delete cascade,
  version text not null,
  notes text,
  minimum_supported_version text,
  rollout_percent integer not null default 100 check (rollout_percent between 0 and 100),
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (channel_id, version)
);

create index reservations_station_window_idx on public.reservations (station_id, starts_at, ends_at);
create index reservations_user_window_idx on public.reservations (user_id, starts_at desc);
create index stations_org_enabled_idx on public.stations (organization_id, enabled);
create index access_codes_validity_idx on public.access_codes (organization_id, station_id, valid_from, valid_until);
create index sessions_active_station_idx on public.sessions (station_id, state, started_at desc);
create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);

create trigger organizations_set_updated_at before update on public.organizations
for each row execute function public.set_updated_at();
create trigger user_profiles_set_updated_at before update on public.user_profiles
for each row execute function public.set_updated_at();
create trigger desktop_release_channels_set_updated_at before update on public.desktop_release_channels
for each row execute function public.set_updated_at();
create trigger memberships_set_updated_at before update on public.memberships
for each row execute function public.set_updated_at();
create trigger stations_set_updated_at before update on public.stations
for each row execute function public.set_updated_at();
create trigger reservations_set_updated_at before update on public.reservations
for each row execute function public.set_updated_at();
create trigger access_codes_set_updated_at before update on public.access_codes
for each row execute function public.set_updated_at();
create trigger sessions_set_updated_at before update on public.sessions
for each row execute function public.set_updated_at();
create trigger desktop_app_versions_set_updated_at before update on public.desktop_app_versions
for each row execute function public.set_updated_at();

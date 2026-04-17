-- Organization access policy for domain-based membership control
alter table public.organizations
  add column if not exists email_domain text,
  add column if not exists access_policy text not null default 'closed';

-- access_policy values:
--   'open'      → anyone with matching email_domain can join automatically
--   'blocklist' → matching email_domain joins unless email is in email_rules with allowed=false
--   'allowlist' → only emails explicitly in email_rules with allowed=true can join
--   'closed'    → invitation-only (no auto-join)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_access_policy_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_access_policy_check
        check (access_policy in ('open', 'blocklist', 'allowlist', 'closed'));
  end if;
end
$$;

create table if not exists public.organization_email_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  allowed boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, email)
);

create index if not exists organization_email_rules_org_idx on public.organization_email_rules(organization_id);

alter table public.organization_email_rules enable row level security;

-- Org admins manage rules
drop policy if exists "Org admins read rules" on public.organization_email_rules;
create policy "Org admins read rules" on public.organization_email_rules
  for select using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = organization_email_rules.organization_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin', 'super_admin')
    )
  );

drop policy if exists "Org admins write rules" on public.organization_email_rules;
create policy "Org admins write rules" on public.organization_email_rules
  for all using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = organization_email_rules.organization_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin', 'super_admin')
    )
  );

-- RPC: create organization + initial admin membership atomically.
-- Also upserts user_profiles row since memberships.user_id FK references it.
create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_email_domain text,
  p_access_policy text
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org public.organizations;
  uid uuid := auth.uid();
  uemail text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select email into uemail from auth.users where id = uid;

  insert into public.user_profiles (id, email, display_name)
    values (uid, uemail, coalesce(
      (select raw_user_meta_data->>'full_name' from auth.users where id = uid),
      (select raw_user_meta_data->>'name' from auth.users where id = uid),
      uemail
    ))
    on conflict (id) do update set email = excluded.email;

  insert into public.organizations (name, slug, email_domain, access_policy)
    values (p_name, p_slug, p_email_domain, p_access_policy)
    returning * into new_org;

  insert into public.memberships (organization_id, user_id, role)
    values (new_org.id, uid, 'org_admin');

  return new_org;
end;
$$;

grant execute on function public.create_organization to authenticated;

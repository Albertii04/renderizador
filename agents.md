# Agents Guide

## Architecture

Renderizador follows Caveman principles: simple code, explicit logic, obvious data flow, and no unnecessary abstraction. The monorepo is split into two apps and a handful of focused shared packages.

- Electron owns workstation-specific concerns: local config, secure IPC, updater scaffold, and local launcher actions.
- Expo owns user and admin product workflows: reservations, stations, roles, releases, sessions, and audits.
- Supabase owns authentication, data persistence, RLS authorization, realtime, and edge-function extensibility.
- Shared packages contain only code reused in more than one place or code that benefits from central typing.

## How to run

```bash
pnpm install
pnpm dev
```

Common commands:

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm db:login
pnpm db:link
pnpm db:push
pnpm types:generate
```

## How to extend Electron

- Keep all OS access inside `apps/desktop/src/main`.
- Add new preload APIs only through `apps/desktop/src/preload/index.ts`.
- Expose the smallest possible IPC surface through `contextBridge`.
- Never import Node or Electron APIs directly in renderer code.
- Store station-local state in the main process, not in the renderer.

## How to extend Mobile

- Add new routes under `apps/mobile/app`.
- Keep product logic in small screen files until reuse becomes real.
- Use shared helpers from `packages/utils` for access and role logic.
- Use Supabase directly from the app through `packages/supabase`.
- Keep admin flows in mobile; do not create a separate admin web app.

## How to extend DB

- Only add schema changes through numbered SQL migrations in `supabase/migrations`.
- Use the next number in sequence, for example `0005_some_change.sql`.
- If the schema changes, regenerate types with `pnpm types:generate`.
- Keep RLS changes explicit in migrations; never rely on undocumented dashboard edits.
- Prefer SQL functions or views only when they simplify repeated business checks.

## Migration rules

- Never edit live tables manually outside migrations.
- Never rename or reorder old migrations after they are applied.
- Keep one logical change per numbered migration where possible.
- Document intent in SQL with short comments only when the logic is not obvious.
- Seed only stable demo/reference data; do not seed real user accounts.

## Security rules

- Authentication is not authorization. Always enforce authorization in RLS and role checks.
- Never ship the Supabase service-role key to Electron renderer or Expo.
- Keep Electron `contextIsolation` on and `nodeIntegration` off.
- Restrict IPC methods to known typed handlers.
- Treat access codes as hashed values in the database.
- Audit privileged actions.

## Environment rules

- Local development expects Node `22.6.0+`.
- Shell env vars are the source of truth for Supabase bootstrap commands.
- Public Supabase URL and anon key may be exposed to desktop/mobile clients.
- Service-role and access-token values remain server/operator-only.

## DO / DO NOT

DO:

- Keep logic direct and readable.
- Reuse shared types and helpers when there is actual cross-app benefit.
- Prefer plain functions over frameworks or custom abstractions.
- Keep the repo runnable while iterating.

DO NOT:

- Add a custom backend server.
- Add Firebase.
- Add an admin web app.
- Hide authorization logic in client-only code.
- Introduce abstraction layers that do not remove real duplication.

## Caveman

The Caveman rule for this repo is simple: choose maintainable code over clever code. If a feature can be expressed with a small explicit function, a short SQL policy, or a single screen component, prefer that over generic machinery.

## Autoskills

Run `npx autoskills` after installing dependencies under Node 22+. The generated skill metadata is expected to be additive project guidance. Commit whatever it adds at the repo root and update this section if the generated layout changes.

Current state in this workspace:

- `autoskills` and `skills` are installed as root dev dependencies.
- `autoskills` was executed through a Node 22 shim because the current shell runtime is still below the repo target.
- It detected the stack correctly and installed 23 skills under `.agents/skills`.
- One install target failed: `vercel-labs/agent-skills/electron-best-practices`.
- Electron coverage was added manually after that failure with:
  - `.agents/skills/electron-scaffold`
  - `.agents/skills/electron`

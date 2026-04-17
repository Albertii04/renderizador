# Renderizador

Renderizador is a production-oriented monorepo for shared render and remote desktop stations. It ships a real MVP with:

- Electron desktop client for station lock/unlock, launcher actions, updates, and local station configuration
- Expo mobile app for sign-in, reservations, stations, and role-based admin screens
- Supabase for auth, Postgres, RLS, realtime, and edge-function scaffolding
- Shared TypeScript packages for config, types, utilities, UI primitives, and Supabase helpers

## Architecture

- `apps/desktop`: Electron main/preload/renderer with React + Vite + Tailwind
- `apps/mobile`: Expo Router app with role-aware screens for users and admins
- `packages/config`: shared enums and runtime constants
- `packages/types`: domain DTOs and generated Supabase database types
- `packages/utils`: pure access-control and session helpers with tests
- `packages/supabase`: typed Supabase client factories and query helpers
- `packages/ui`: small shared UI primitives reused by desktop
- `supabase`: numbered migrations, seed data, RLS policies, and edge-function placeholders

## Setup

1. Use Node `22.6.0+`.
2. Install dependencies:

```bash
pnpm install
```

3. Link and push Supabase:

```bash
pnpm db:login
pnpm db:link
pnpm db:push
pnpm types:generate
```

## Dev flow

Run everything:

```bash
pnpm dev
```

Run apps separately:

```bash
pnpm --filter @renderizador/desktop dev
pnpm --filter @renderizador/mobile dev
```

Checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Implemented

- Turborepo + pnpm workspace scaffold
- Shared TypeScript packages and reusable access logic
- Electron desktop shell with boot, auth, locked screen, launcher, settings, secure preload IPC, and updater scaffold
- Expo mobile shell with sign-in, stations, reservations, profile, and admin routes
- Numbered Supabase migrations for schema, RLS, seed data, and session/access helpers
- Placeholder edge functions for release/admin and session-access workflows
- Vitest coverage for reservation validation, access-code validation, and role logic

## Desktop releases

Release flow for the Electron desktop client:

1. Bump `apps/desktop/package.json#version`, commit and push `main`.
2. Tag: `git tag desktop-v0.1.1 && git push origin desktop-v0.1.1`.
3. GitHub Actions builds the Windows installer and publishes it to the repo's Releases page.
4. Installed clients auto-update within an hour.

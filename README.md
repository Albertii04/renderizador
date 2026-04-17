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

3. Copy envs from `.env.example` and export them in your shell:

```bash
export SUPABASE_URL=...
export SUPABASE_ANON_KEY=...
export SUPABASE_SERVICE_ROLE_KEY=...
export SUPABASE_ACCESS_TOKEN=...
export SUPABASE_PROJECT_REF=...
export EXPO_PUBLIC_SUPABASE_URL="$SUPABASE_URL"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"
export VITE_SUPABASE_URL="$SUPABASE_URL"
export VITE_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"
```

4. Initialize autoskills:

```bash
npx autoskills
```

5. Link and push Supabase:

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

## Environment variables

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Implemented

- Turborepo + pnpm workspace scaffold
- Shared TypeScript packages and reusable access logic
- Electron desktop shell with boot, auth, locked screen, launcher, settings, secure preload IPC, and updater scaffold
- Expo mobile shell with sign-in, stations, reservations, profile, and admin routes
- Numbered Supabase migrations for schema, RLS, seed data, and session/access helpers
- Placeholder edge functions for release/admin and session-access workflows
- Vitest coverage for reservation validation, access-code validation, and role logic

## Placeholder areas

- Real Microsoft OAuth redirect wiring in Electron and Expo
- Real desktop launcher integration for D5 and RDP
- Full mutation forms in mobile admin flows
- Production updater publish pipeline
- Generated Supabase types from a live linked project if credentials are not available yet

## Next steps

1. Enable Microsoft provider in Supabase and wire the redirect URLs for Electron and Expo.
2. Replace demo reservation/session data in both apps with live TanStack Query hooks against Supabase.
3. Add realtime subscriptions for reservation/session state in desktop and mobile.
4. Integrate real D5 and remote desktop launch commands in the Electron main process.
5. Add release promotion and audit-log mutations through Supabase RPC or edge functions.

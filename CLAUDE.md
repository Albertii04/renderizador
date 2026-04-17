# Renderizador — CLAUDE.md

## What this project is

Renderizador is a production monorepo for shared render and remote desktop stations. It ships:

- **Electron desktop client** — station lock/unlock, launcher actions (D5/RDP), updates, local station config
- **Expo mobile app** — sign-in, reservations, stations, role-based admin screens
- **Supabase** — auth, Postgres, RLS, realtime, edge-function scaffolding
- **Shared TypeScript packages** — config, types, utils, UI primitives, Supabase helpers

## Architecture

```
apps/
  desktop/    Electron: main / preload / renderer (React + Vite + Tailwind)
  mobile/     Expo Router: role-aware screens for users and admins
packages/
  config/     shared enums and runtime constants
  types/      domain DTOs + generated Supabase database types
  utils/      pure access-control and session helpers (with tests)
  supabase/   typed Supabase client factories and query helpers
  ui/         small shared UI primitives reused by desktop
supabase/
  migrations/ numbered SQL migrations
  functions/  edge function placeholders
```

**Caveman principle:** simple code, explicit logic, obvious data flow, no unnecessary abstraction.

- Electron owns: local config, secure IPC, updater scaffold, local launcher actions
- Expo owns: user and admin product workflows (reservations, stations, roles, releases, sessions, audits)
- Supabase owns: authentication, data persistence, RLS authorization, realtime, edge functions
- Shared packages: only code reused in more than one place or that benefits from central typing

## How to run

```bash
pnpm install       # requires Node >= 22.6.0
pnpm dev           # runs all apps in parallel
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

### Database commands

```bash
pnpm db:login       # supabase login with SUPABASE_ACCESS_TOKEN
pnpm db:link        # link to SUPABASE_PROJECT_REF
pnpm db:push        # push migrations
pnpm db:reset       # reset local db
pnpm types:generate # regenerate packages/types/src/database.generated.ts
```

## Environment variables

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY    # server/operator only — never ship to client
SUPABASE_ACCESS_TOKEN        # server/operator only
SUPABASE_PROJECT_REF
EXPO_PUBLIC_SUPABASE_URL     # mirrors SUPABASE_URL for Expo
EXPO_PUBLIC_SUPABASE_ANON_KEY
VITE_SUPABASE_URL            # mirrors SUPABASE_URL for Vite/Electron renderer
VITE_SUPABASE_ANON_KEY
```

Public Supabase URL and anon key may be exposed to desktop/mobile clients.
Service-role and access-token values remain server/operator-only.

## How to extend Electron

- Keep all OS access inside `apps/desktop/src/main`
- Add new preload APIs only through `apps/desktop/src/preload/index.ts`
- Expose the smallest possible IPC surface through `contextBridge`
- Never import Node or Electron APIs directly in renderer code
- Store station-local state in the main process, not in the renderer

## How to extend Mobile

- Add new routes under `apps/mobile/app`
- Keep product logic in small screen files until reuse becomes real
- Use shared helpers from `packages/utils` for access and role logic
- Use Supabase directly from the app through `packages/supabase`
- Keep admin flows in mobile; do not create a separate admin web app

## How to extend the DB

- Only add schema changes through numbered SQL migrations in `supabase/migrations`
- Use the next number in sequence, e.g. `0005_some_change.sql`
- If the schema changes, regenerate types with `pnpm types:generate`
- Keep RLS changes explicit in migrations; never rely on undocumented dashboard edits
- Prefer SQL functions or views only when they simplify repeated business checks

## Migration rules

- Never edit live tables manually outside migrations
- Never rename or reorder old migrations after they are applied
- Keep one logical change per numbered migration where possible
- Seed only stable demo/reference data; do not seed real user accounts

## Security rules

- Authentication ≠ authorization. Always enforce authorization in RLS and role checks
- Never ship the Supabase service-role key to Electron renderer or Expo
- Keep Electron `contextIsolation: true` and `nodeIntegration: false`
- Restrict IPC methods to known typed handlers
- Treat access codes as hashed values in the database
- Audit privileged actions

## DO / DO NOT

**DO:**
- Keep logic direct and readable
- Reuse shared types and helpers when there is actual cross-app benefit
- Prefer plain functions over frameworks or custom abstractions
- Keep the repo runnable while iterating

**DO NOT:**
- Add a custom backend server
- Add Firebase
- Add an admin web app
- Hide authorization logic in client-only code
- Introduce abstraction layers that do not remove real duplication

## Desktop app flow

The app has two modes, selected once on first launch and stored in `StationConfig.mode`:

**Server mode** (`mode: "server"`):
- Shows `GatekeeperPage` — access code input screen
- Worker enters their temporary reservation code → validated against Supabase → session starts
- While session active: shows countdown + "End session" button
- No Microsoft login required for code validation (uses anon Supabase key)

**Client mode** (`mode: "client"`):
- Requires Microsoft login (`AuthPage`)
- After login: shows `ClientLauncherPage` — one "Conectar al servidor" button
- On connect: calls `rdp:connect` IPC handler:
  - **Mac**: stores credentials in macOS Keychain (`security add-internet-password`), writes `.rdp` file to temp dir, opens with "Windows App"
  - **Windows**: stores credentials via `cmdkey`, launches `mstsc`

**RDP credentials** (`rdpHost`, `rdpWindowsUsername`, `rdpWindowsPassword`) are stored in `StationConfig` (local Electron store). Set via the settings page. In the future the mobile admin UI will push these to `station.metadata` in Supabase.

**Boot flow**: `boot` → no mode → `mode-select` → server → (no `stationId` → `pairing`) → `gatekeeper` / client → `auth` → `client-launcher`

## Station pairing flow (one-time code)

Stations are created from the mobile admin app. Creating a station triggers `generate_station_pairing_code` (RPC in migration `0011_station_pairing.sql`), which returns an 8-char one-time code valid for 15 minutes. The admin shows the code to the on-site operator.

On the desktop, choosing **Servidor** in mode select routes to the `PairingPage` — no Microsoft login required. The operator enters the code; the renderer calls the anon-callable `claim_station_pairing` RPC, which atomically invalidates the code and returns the `station_id`, `station_code`, `station_secret`, and RDP/metadata fields. These are persisted via `station-config:save` IPC (secrets encrypted with `safeStorage`), and the app transitions to `gatekeeper`.

Codes are single-use and expire in 15 minutes. Admins can regenerate a new code from the station edit screen if the first one expires or is lost.

## Microsoft OAuth (Electron desktop)

The full PKCE OAuth flow is implemented and working:

- `apps/desktop/src/renderer/pages/auth-page.tsx` — calls `signInWithOAuth({ provider: "azure" })`, opens modal auth window, exchanges code with Supabase
- `apps/desktop/src/main/index.ts` — `startMicrosoftAuth` opens a sandboxed BrowserWindow, intercepts `will-redirect` / `will-navigate` to capture the callback URL before Electron navigates
- `apps/desktop/src/preload/index.ts` — exposes `startMicrosoftAuth` via contextBridge

**Supabase**: Azure provider enabled with tenant `common` (any Microsoft account), credentials configured, redirect URL `http://localhost:5173` in the allowed list.

**Azure AD app** (`fa954bfe-effc-4f39-899e-85da7bf41f56`): registered with `https://jufooheukaagcgbufsuw.supabase.co/auth/v1/callback` as redirect URI. Verified working.

**env loading**: `apps/desktop/vite.config.ts` sets `envDir: "../../"` so Vite loads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the monorepo root `.env.local`.

## Desktop releases & auto-update

Releases ship through the public Supabase Storage bucket `desktop-releases`
(created by migration `0013_desktop_releases_bucket.sql`). Only the latest
release lives there at any time — the publish script wipes the bucket before
uploading new artifacts.

`apps/desktop/electron-builder.json` configures `publish.provider = "generic"`
pointing at `https://<project>.supabase.co/storage/v1/object/public/desktop-releases`.
electron-updater reads `latest.yml` (Windows), `latest-mac.yml`, or
`latest-linux.yml` from that URL. `startAutoUpdateLoop` in
`apps/desktop/src/main/updater.ts` checks on boot and then every hour when the
app is packaged. Updates auto-download; the renderer can call
`workstation.installUpdate()` to quit and install immediately, otherwise the
update installs on quit.

Release flow (bump `apps/desktop/package.json#version` first):

```bash
# From repo root. Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
pnpm --filter @renderizador/desktop release:win   # or release:mac
```

`release:*` runs `pack:*` (electron-builder with `--publish never`) then
`release:publish` (`apps/desktop/scripts/publish-release.mjs`), which lists the
bucket, removes every object, and uploads the contents of
`apps/desktop/release/` that match `*.exe|dmg|zip|AppImage|blockmap|yml`.

Bucket policy is public-read only. Writes require the service-role key and
must happen from a trusted operator machine or CI — never from the Electron or
Expo client.

## Placeholder areas (not yet implemented)

- Real Microsoft OAuth redirect wiring in Expo mobile
- Real desktop launcher integration for D5 and RDP
- Full mutation forms in mobile admin flows
- Code signing for Windows and macOS installers
- Generated Supabase types from a live linked project

## Next steps

1. Enable Microsoft provider in Supabase and wire redirect URLs for Electron and Expo
2. Replace demo reservation/session data with live TanStack Query hooks against Supabase
3. Add realtime subscriptions for reservation/session state in desktop and mobile
4. Integrate real D5 and remote desktop launch commands in the Electron main process
5. Add release promotion and audit-log mutations through Supabase RPC or edge functions

## Tooling

- **Turborepo** — build orchestration (`turbo.json` at root)
- **pnpm** — package manager with workspaces (`pnpm-workspace.yaml`)
- **autoskills / skills** — Codex skill system; run `npx autoskills` after install; skills live in `.agents/skills/`
- **Vitest** — unit tests (`vitest.workspace.ts`)
- Node `>= 22.6.0` required

## Active skills (`.agents/skills/`)

These are Codex-format skills also usable as reference documentation:

| Skill | Source |
|---|---|
| turborepo | vercel/turborepo |
| supabase-postgres-best-practices | supabase/agent-skills |
| building-native-ui | expo/skills |
| expo-api-routes | expo/skills |
| expo-cicd-workflows | expo/skills |
| expo-dev-client | expo/skills |
| expo-tailwind-setup | expo/skills |
| native-data-fetching | expo/skills |
| upgrading-expo | expo/skills |
| use-dom | expo/skills |
| vite | antfu/skills |
| vitest | antfu/skills |
| vercel-composition-patterns | vercel-labs/agent-skills |
| vercel-react-best-practices | vercel-labs/agent-skills |
| tailwind-css-patterns | giuseppe-trisciuoglio/developer-kit |
| typescript-advanced-types | wshobson/agents |
| nodejs-backend-patterns | wshobson/agents |
| nodejs-best-practices | sickn33/antigravity-awesome-skills |
| frontend-design | anthropics/skills |
| sleek-design-mobile-apps | sleekdotdesign/agent-skills |
| accessibility | addyosmani/web-quality-skills |
| seo | addyosmani/web-quality-skills |
| electron | (manual install) |
| electron-scaffold | (manual install) |

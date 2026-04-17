import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSessionWarningLevel } from "@renderizador/utils";
import type {
  AccessDecision,
  AccessCodeSummary,
  AuditLogSummary,
  Database,
  MembershipSummary,
  ReservationConflict,
  ReservationSummary,
  SessionSummary,
  StationRuntimeSnapshot,
  StationSummary,
  UserProfileSummary
} from "@renderizador/types";

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];
type StationRow = Database["public"]["Tables"]["stations"]["Row"];
type AccessCodeRow = Database["public"]["Tables"]["access_codes"]["Row"];
type AuditLogRow = Database["public"]["Tables"]["audit_logs"]["Row"];
type StationInsert = Database["public"]["Tables"]["stations"]["Insert"];
type StationUpdate = Database["public"]["Tables"]["stations"]["Update"];
type AuditJson = Database["public"]["Tables"]["audit_logs"]["Row"]["metadata"];

export function createRenderizadorClient(env: SupabaseEnv): SupabaseClient<Database> {
  return createClient<Database>(env.url, env.anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: "pkce"
    }
  });
}

export const queryKeys = {
  authSession: ["auth-session"] as const,
  profile: ["profile"] as const,
  memberships: ["memberships"] as const,
  stations: ["stations"] as const,
  reservations: ["reservations"] as const,
  sessions: ["sessions"] as const,
  accessCodes: ["access-codes"] as const,
  auditLogs: ["audit-logs"] as const
};

export type AccessPolicy = "open" | "blocklist" | "allowlist" | "closed";

export async function createOrganization(
  client: SupabaseClient<Database>,
  input: { name: string; slug: string; emailDomain: string | null; accessPolicy: AccessPolicy; rules?: Array<{ email: string; allowed: boolean }> }
) {
  const { data: org, error } = await client.rpc("create_organization" as never, {
    p_name: input.name,
    p_slug: input.slug,
    p_email_domain: input.emailDomain,
    p_access_policy: input.accessPolicy,
  } as never) as unknown as { data: { id: string } | null; error: { message: string } | null };

  if (error || !org) return { data: null, error: error ?? { message: "No organization returned" } };

  if (input.rules && input.rules.length > 0) {
    // organization_email_rules not yet in generated types — cast to bypass
    const rows = input.rules.map((r) => ({ organization_id: org.id, email: r.email, allowed: r.allowed }));
    await (client.from as unknown as (n: string) => { insert: (v: unknown) => Promise<unknown> })("organization_email_rules").insert(rows);
  }
  return { data: org, error: null };
}

export async function fetchCurrentProfile(client: SupabaseClient<Database>) {
  return client.from("user_profiles").select("*").single();
}

export async function fetchMemberships(client: SupabaseClient<Database>) {
  return client.from("memberships").select("*");
}

export async function fetchStations(client: SupabaseClient<Database>) {
  return client.from("stations").select("*").order("name");
}

export async function fetchStationCatalog(client: SupabaseClient<Database>) {
  return client.rpc("list_station_catalog");
}

export async function fetchReservationsForUser(client: SupabaseClient<Database>, userId: string) {
  return client.from("reservations").select("*").eq("user_id", userId).order("starts_at");
}

export async function fetchAllReservations(client: SupabaseClient<Database>) {
  return client.from("reservations").select("*").order("starts_at");
}

export async function fetchAllSessions(client: SupabaseClient<Database>) {
  return client.from("sessions").select("*").order("started_at", { ascending: false });
}

export async function fetchAccessCodes(client: SupabaseClient<Database>) {
  return client.from("access_codes").select("*").order("created_at", { ascending: false });
}

export async function fetchAuditLogs(client: SupabaseClient<Database>) {
  return client.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(100);
}

export async function fetchReleaseChannels(client: SupabaseClient<Database>) {
  return client.from("desktop_release_channels").select("*").order("name");
}

export async function fetchDesktopAppVersions(client: SupabaseClient<Database>) {
  return client.from("desktop_app_versions").select("*").order("published_at", { ascending: false });
}

export async function fetchStationByCode(client: SupabaseClient<Database>, stationCode: string) {
  return client.rpc("get_station_by_code", { station_code_input: stationCode });
}

export async function fetchActiveStationSession(client: SupabaseClient<Database>, stationId: string, stationSecret?: string) {
  return client.rpc("get_active_station_session", { station_uuid: stationId, station_secret_input: stationSecret ?? undefined });
}

export async function fetchReservationById(client: SupabaseClient<Database>, reservationId: string) {
  return client.from("reservations").select("*").eq("id", reservationId).single();
}

export async function fetchStationRuntimeSnapshot(client: SupabaseClient<Database>, stationId: string) {
  return client.rpc("station_runtime_snapshot", { station_uuid: stationId });
}

export async function fetchStationRuntimeSnapshotWithSecret(
  client: SupabaseClient<Database>,
  stationId: string,
  stationSecret: string
) {
  return client.rpc("station_runtime_snapshot_with_secret", { station_uuid: stationId, station_secret_input: stationSecret });
}

export async function findReservationConflict(
  client: SupabaseClient<Database>,
  input: { stationId: string; startsAt: string; endsAt: string; ignoreReservationId?: string | null }
) {
  return client.rpc("find_reservation_conflict", {
    station_uuid: input.stationId,
    starts_at_input: input.startsAt,
    ends_at_input: input.endsAt,
    ignore_reservation_uuid: input.ignoreReservationId ?? undefined
  });
}

export async function createReservationWithCode(
  client: SupabaseClient<Database>,
  input: {
    stationId: string;
    startsAt: string;
    endsAt: string;
    estimatedMinutes: number;
    projectName: string;
    workType: string;
    bufferMinutes?: number;
    instructions?: string | null;
  }
) {
  return client.rpc("create_reservation_with_code", {
    station_uuid: input.stationId,
    starts_at_input: input.startsAt,
    ends_at_input: input.endsAt,
    estimated_minutes_input: input.estimatedMinutes,
    project_name_input: input.projectName,
    work_type_input: input.workType,
    buffer_minutes_input: input.bufferMinutes ?? 15,
    instructions_input: input.instructions ?? undefined
  });
}

export async function checkStationAccess(
  client: SupabaseClient<Database>,
  stationId: string,
  providedCodeHash?: string,
  stationSecret?: string
) {
  return client.rpc("can_access_station", {
    station_uuid: stationId,
    provided_code_hash: providedCodeHash ?? undefined,
    station_secret_input: stationSecret ?? undefined
  });
}

export async function startStationSession(
  client: SupabaseClient<Database>,
  input: {
    stationId: string;
    reservationId?: string | null;
    accessCodeId?: string | null;
    adminOverride?: boolean;
    estimatedMinutes?: number;
    stationSecret?: string;
  }
) {
  return client.rpc("start_station_session", {
    station_uuid: input.stationId,
    reservation_uuid: input.reservationId ?? undefined,
    access_code_uuid: input.accessCodeId ?? undefined,
    admin_override_value: input.adminOverride ?? false,
    estimated_minutes_value: input.estimatedMinutes ?? 120,
    station_secret_input: input.stationSecret ?? undefined
  });
}

export async function endStationSession(client: SupabaseClient<Database>, sessionId: string, stationSecret?: string) {
  return client.rpc("end_station_session", {
    session_uuid: sessionId,
    station_secret_input: stationSecret ?? undefined
  });
}

export async function revokeStationSession(client: SupabaseClient<Database>, sessionId: string, reason = "revoked_by_admin") {
  return client.rpc("revoke_station_session", {
    session_uuid: sessionId,
    reason_input: reason
  });
}

export async function extendStationSession(client: SupabaseClient<Database>, sessionId: string, extraMinutes: number) {
  return client.rpc("extend_station_session", {
    session_uuid: sessionId,
    extra_minutes: extraMinutes
  });
}

export async function recordAuditEvent(
  client: SupabaseClient<Database>,
  input: {
    organizationId: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    stationId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  return client.rpc("record_audit_event", {
    organization_uuid: input.organizationId,
    action_name: input.action,
    entity_type_name: input.entityType,
    entity_uuid: input.entityId ?? undefined,
    station_uuid: input.stationId ?? undefined,
    metadata_payload: (input.metadata ?? {}) as AuditJson
  });
}

export async function generateStationPairingCode(
  client: SupabaseClient<Database>,
  input: { stationId: string; ttlMinutes?: number }
) {
  return client.rpc("generate_station_pairing_code" as never, {
    station_uuid: input.stationId,
    ttl_minutes: input.ttlMinutes ?? 15
  } as never) as unknown as { data: { ok: boolean; plain_code: string; expires_at: string } | null; error: { message: string } | null };
}

export async function unpairStation(client: SupabaseClient<Database>, stationId: string) {
  return client.rpc("unpair_station" as never, { station_uuid: stationId } as never) as unknown as {
    data: { ok: boolean } | null;
    error: { message: string } | null;
  };
}

export async function checkStationPairing(
  client: SupabaseClient<Database>,
  input: { stationId: string; stationSecret: string }
) {
  return client.rpc("check_station_pairing" as never, {
    station_uuid: input.stationId,
    station_secret_input: input.stationSecret
  } as never) as unknown as {
    data: { paired: boolean; reason?: string; free_access?: boolean } | null;
    error: { message: string } | null;
  };
}

export async function claimStationPairing(client: SupabaseClient<Database>, code: string) {
  return client.rpc("claim_station_pairing" as never, { p_code: code } as never) as unknown as {
    data: {
      ok: boolean;
      station_id: string;
      station_code: string;
      station_name: string;
      organization_id: string;
      station_secret: string;
      free_access: boolean;
      metadata: Record<string, unknown> | null;
    } | null;
    error: { message: string } | null;
  };
}

export async function createStation(
  client: SupabaseClient<Database>,
  input: {
    organizationId: string;
    releaseChannelId?: string | null;
    name: string;
    slug: string;
    stationCode: string;
    location?: string | null;
    enabled?: boolean;
    freeAccess?: boolean;
    instructions?: string;
    d5ExecutablePath?: string;
    rdpCommand?: string;
    rdpHost?: string;
    rdpWindowsUsername?: string;
    rdpWindowsPassword?: string;
    stationSecret?: string;
  }
) {
  const payload: StationInsert = {
    organization_id: input.organizationId,
    release_channel_id: input.releaseChannelId ?? undefined,
    name: input.name,
    slug: input.slug,
    station_code: input.stationCode,
    location: input.location ?? null,
    enabled: input.enabled ?? true,
    free_access: input.freeAccess ?? false,
    metadata: {
      instructions: input.instructions ?? "",
      d5ExecutablePath: input.d5ExecutablePath ?? "",
      rdpCommand: input.rdpCommand ?? "",
      rdpHost: input.rdpHost ?? "",
      rdpWindowsUsername: input.rdpWindowsUsername ?? "",
      rdpWindowsPassword: input.rdpWindowsPassword ?? "",
      station_secret: input.stationSecret ?? ""
    } as AuditJson
  };
  return client.from("stations").insert(payload).select("*").single();
}

export async function updateStation(
  client: SupabaseClient<Database>,
  input: {
    id: string;
    releaseChannelId?: string | null;
    name?: string;
    slug?: string;
    stationCode?: string;
    location?: string | null;
    enabled?: boolean;
    freeAccess?: boolean;
    instructions?: string;
    d5ExecutablePath?: string;
    rdpCommand?: string;
    rdpHost?: string;
    rdpWindowsUsername?: string;
    rdpWindowsPassword?: string;
    stationSecret?: string;
  }
) {
  const metadataUpdates: Record<string, unknown> = {};
  if (input.instructions !== undefined) metadataUpdates.instructions = input.instructions;
  if (input.d5ExecutablePath !== undefined) metadataUpdates.d5ExecutablePath = input.d5ExecutablePath;
  if (input.rdpCommand !== undefined) metadataUpdates.rdpCommand = input.rdpCommand;
  if (input.rdpHost !== undefined) metadataUpdates.rdpHost = input.rdpHost;
  if (input.rdpWindowsUsername !== undefined) metadataUpdates.rdpWindowsUsername = input.rdpWindowsUsername;
  if (input.rdpWindowsPassword !== undefined) metadataUpdates.rdpWindowsPassword = input.rdpWindowsPassword;
  if (input.stationSecret !== undefined) metadataUpdates.station_secret = input.stationSecret;

  const updatePayload: StationUpdate = {};
  if (input.releaseChannelId !== undefined) updatePayload.release_channel_id = input.releaseChannelId;
  if (input.name !== undefined) updatePayload.name = input.name;
  if (input.slug !== undefined) updatePayload.slug = input.slug;
  if (input.stationCode !== undefined) updatePayload.station_code = input.stationCode;
  if (input.location !== undefined) updatePayload.location = input.location;
  if (input.enabled !== undefined) updatePayload.enabled = input.enabled;
  if (input.freeAccess !== undefined) updatePayload.free_access = input.freeAccess;
  if (Object.keys(metadataUpdates).length > 0) {
    const current = await client.from("stations").select("metadata").eq("id", input.id).single();
    updatePayload.metadata = {
      ...((current.data?.metadata as Record<string, unknown> | null) ?? {}),
      ...metadataUpdates
    } as AuditJson;
  }

  return client.from("stations").update(updatePayload).eq("id", input.id).select("*").single();
}

export async function cancelReservation(client: SupabaseClient<Database>, reservationId: string) {
  return client.from("reservations").update({ status: "cancelled" }).eq("id", reservationId).select("*").single();
}

export async function moveReservation(
  client: SupabaseClient<Database>,
  input: { id: string; startsAt: string; endsAt: string; estimatedMinutes: number }
) {
  return client.from("reservations").update({
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    estimated_minutes: input.estimatedMinutes
  }).eq("id", input.id).select("*").single();
}

export async function createAccessCode(
  client: SupabaseClient<Database>,
  input: {
    organizationId: string;
    stationId?: string | null;
    reservationId?: string | null;
    codeHash: string;
    validFrom: string;
    validUntil: string;
    maxUses?: number | null;
  }
) {
  return client.from("access_codes").insert({
    organization_id: input.organizationId,
    station_id: input.stationId ?? undefined,
    reservation_id: input.reservationId ?? undefined,
    code_hash: input.codeHash,
    valid_from: input.validFrom,
    valid_until: input.validUntil,
    max_uses: input.maxUses ?? undefined
  }).select("*").single();
}

export async function createAdminAccessCode(
  client: SupabaseClient<Database>,
  input: { stationId: string; validFrom: string; validUntil: string; maxUses?: number }
) {
  return client.rpc("create_admin_access_code", {
    station_uuid: input.stationId,
    valid_from_input: input.validFrom,
    valid_until_input: input.validUntil,
    max_uses_input: input.maxUses ?? 1
  });
}

export async function revokeAccessCode(client: SupabaseClient<Database>, accessCodeId: string) {
  return client.from("access_codes").update({ disabled_at: new Date().toISOString() }).eq("id", accessCodeId).select("*").single();
}

export async function updateMembershipRole(client: SupabaseClient<Database>, membershipId: string, role: MembershipSummary["role"]) {
  return client.from("memberships").update({ role }).eq("id", membershipId).select("*").single();
}

export async function assignStationReleaseChannel(client: SupabaseClient<Database>, stationId: string, releaseChannelId: string | null) {
  return client.from("stations").update({ release_channel_id: releaseChannelId }).eq("id", stationId).select("*").single();
}

export function mapStation(row: StationRow): StationSummary {
  const metadata = (row.metadata as Record<string, unknown> | null) ?? {};
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    stationCode: row.station_code,
    location: row.location,
    enabled: row.enabled,
    freeAccess: row.free_access ?? false,
    releaseChannel: ((metadata.releaseChannel as "stable" | "beta" | undefined) ?? "stable"),
    instructions: typeof metadata.instructions === "string" ? metadata.instructions : "",
    d5ExecutablePath: typeof metadata.d5ExecutablePath === "string" ? metadata.d5ExecutablePath : undefined,
    rdpCommand: typeof metadata.rdpCommand === "string" ? metadata.rdpCommand : undefined,
    rdpHost: typeof metadata.rdpHost === "string" ? metadata.rdpHost : undefined,
    rdpWindowsUsername: typeof metadata.rdpWindowsUsername === "string" ? metadata.rdpWindowsUsername : undefined,
    rdpWindowsPassword: typeof metadata.rdpWindowsPassword === "string" ? metadata.rdpWindowsPassword : undefined,
    pairedAt: row.paired_at ?? null,
    lastSeenAt: typeof metadata.last_seen_at === "string" ? (metadata.last_seen_at as string) : null
  };
}

export async function deleteStation(client: SupabaseClient<Database>, stationId: string) {
  // delete_station was added in migration 0016 and is not yet in the
  // generated Database type — cast until types:generate is re-run.
  return (client.rpc as unknown as (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown }>)(
    "delete_station",
    { station_uuid: stationId }
  );
}

export async function recordStationHeartbeat(
  client: SupabaseClient<Database>,
  stationId: string,
  stationSecret: string
) {
  // station_heartbeat was added in migration 0015 and is not yet in the
  // generated Database type — cast until types:generate is re-run.
  return (client.rpc as unknown as (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown }>)(
    "station_heartbeat",
    { station_uuid: stationId, station_secret_input: stationSecret }
  );
}

export function mapReservation(row: ReservationRow): ReservationSummary {
  return {
    id: row.id,
    organizationId: row.organization_id,
    stationId: row.station_id,
    userId: row.user_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    estimatedMinutes: row.estimated_minutes,
    status: row.status,
    projectName: row.project_name,
    workType: row.work_type,
    bufferMinutes: row.buffer_minutes,
    instructions: row.instructions,
    accessCode: null
  };
}

export function mapSession(row: SessionRow, nextReservationId: string | null = null): SessionSummary {
  return {
    id: row.id,
    stationId: row.station_id,
    organizationId: row.organization_id,
    userId: row.user_id,
    reservationId: row.reservation_id,
    accessCodeId: row.access_code_id,
    startsAt: row.started_at,
    estimatedEndAt: row.estimated_end_at,
    actualEndAt: row.actual_end_at,
    state: row.state,
    adminOverride: row.admin_override,
    revokedAt: row.revoked_at,
    terminationReason: row.termination_reason,
    warningLevel: getSessionWarningLevel(new Date(), {
      estimatedEndAt: row.estimated_end_at,
      actualEndAt: row.actual_end_at
    }),
    nextReservationId
  };
}

export function mapMembership(row: Database["public"]["Tables"]["memberships"]["Row"]): MembershipSummary {
  return {
    id: row.id,
    organizationId: row.organization_id,
    role: row.role,
    stationIds: row.station_ids ?? []
  };
}

export function mapProfile(row: Database["public"]["Tables"]["user_profiles"]["Row"]): UserProfileSummary {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name
  };
}

export function mapAccessCode(row: AccessCodeRow): AccessCodeSummary {
  return {
    id: row.id,
    codeHash: row.code_hash,
    displayCode: row.display_code,
    stationId: row.station_id,
    reservationId: row.reservation_id,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    maxUses: row.max_uses,
    usedCount: row.used_count,
    disabledAt: row.disabled_at
  };
}

export function mapAuditLog(row: AuditLogRow): AuditLogSummary {
  return {
    id: row.id,
    organizationId: row.organization_id,
    actorUserId: row.actor_user_id,
    stationId: row.station_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    createdAt: row.created_at
  };
}

export function mapAccessDecision(value: unknown): AccessDecision {
  const data = (value ?? {}) as Record<string, unknown>;
  return {
    allowed: Boolean(data.allowed),
    reason: (typeof data.reason === "string" ? data.reason : "no_access") as AccessDecision["reason"],
    reservationId: typeof data.reservation_id === "string" ? data.reservation_id : null,
    accessCodeId: typeof data.access_code_id === "string" ? data.access_code_id : null,
    failedAttemptsRemaining: typeof data.failed_attempts_remaining === "number" ? data.failed_attempts_remaining : 0,
    nextReservation: data.next_reservation ? mapReservation(data.next_reservation as ReservationRow) : null
  };
}

export function mapReservationConflict(value: unknown): ReservationConflict | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string") {
    return null;
  }

  return {
    id: row.id,
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    status: row.status as ReservationConflict["status"],
    userId: String(row.user_id)
  };
}

export function mapStationRuntimeSnapshot(value: unknown): StationRuntimeSnapshot {
  const data = (value ?? {}) as Record<string, unknown>;
  const nextReservation = data.next_reservation ? mapReservation(data.next_reservation as ReservationRow) : null;
  return {
    station: data.station ? mapStation(data.station as StationRow) : null,
    activeSession: data.active_session ? mapSession(data.active_session as SessionRow, nextReservation?.id ?? null) : null,
    nextReservation,
    stationState:
      data.station_state === "active_session" || data.station_state === "station_unregistered"
        ? data.station_state
        : "locked"
  };
}

export function mapStationCatalog(value: unknown): StationRuntimeSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => mapStationRuntimeSnapshot({
    station: (item as Record<string, unknown>).station,
    active_session: (item as Record<string, unknown>).active_session,
    next_reservation: (item as Record<string, unknown>).next_reservation,
    station_state: (item as Record<string, unknown>).active_session ? "active_session" : "locked"
  }));
}

export function subscribeToActiveSessions(client: SupabaseClient<Database>, onChange: () => void) {
  return client
    .channel("active-sessions")
    .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, onChange)
    .subscribe();
}

import type { Database as GeneratedDatabase } from "./database.generated";
import { roleHierarchy, reservationStatuses, sessionStates } from "@renderizador/config";

export type Database = GeneratedDatabase;
export type Role = (typeof roleHierarchy)[number];
export type ReservationStatus = (typeof reservationStatuses)[number];
export type SessionState = (typeof sessionStates)[number];

export interface StationConfig {
  stationId: string;
  stationCode: string;
  stationName: string;
  organizationId: string;
  releaseChannel: "stable" | "beta";
  instructions: string;
  d5ExecutablePath: string;
  rdpCommand: string;
  stationSecret: string;
  mode: "server" | "client" | "";
  rdpHost: string;
  rdpWindowsUsername: string;
  rdpWindowsPassword: string;
}

export interface StationConfigInput extends Partial<StationConfig> {}

export interface StationSummary {
  id: string;
  organizationId: string;
  name: string;
  stationCode: string;
  location: string | null;
  enabled: boolean;
  releaseChannel: "stable" | "beta";
  instructions: string;
  d5ExecutablePath?: string;
  rdpCommand?: string;
  rdpHost?: string;
  rdpWindowsUsername?: string;
  rdpWindowsPassword?: string;
  nextReservationStartsAt?: string | null;
  nextReservationEndsAt?: string | null;
  activeSessionId?: string | null;
  pairedAt?: string | null;
  lastSeenAt?: string | null;
}

export interface ReservationSummary {
  id: string;
  organizationId: string;
  stationId: string;
  userId: string;
  startsAt: string;
  endsAt: string;
  estimatedMinutes: number;
  status: ReservationStatus;
  projectName: string | null;
  workType: string | null;
  bufferMinutes: number;
  instructions: string | null;
  accessCode: string | null;
}

export interface AccessCodeSummary {
  id: string;
  codeHash: string;
  displayCode: string | null;
  stationId: string | null;
  reservationId?: string | null;
  validFrom: string;
  validUntil: string;
  maxUses: number | null;
  usedCount: number;
  disabledAt?: string | null;
}

export interface MembershipSummary {
  id: string;
  organizationId: string;
  role: Role;
  stationIds?: string[];
}

export interface SessionSummary {
  id: string;
  stationId: string;
  organizationId: string;
  userId: string | null;
  reservationId: string | null;
  accessCodeId: string | null;
  startsAt: string;
  estimatedEndAt: string | null;
  actualEndAt: string | null;
  state: SessionState;
  adminOverride: boolean;
  revokedAt: string | null;
  terminationReason: string | null;
  warningLevel: "normal" | "warning" | "critical" | "expired";
  nextReservationId: string | null;
}

export interface AccessDecision {
  allowed: boolean;
  reason:
    | "reservation"
    | "access_code"
    | "admin_override"
    | "authentication_required"
    | "station_not_found"
    | "no_access";
  reservationId?: string | null;
  accessCodeId?: string | null;
  failedAttemptsRemaining?: number;
  nextReservation?: ReservationSummary | null;
}

export interface ReservationConflict {
  id: string;
  startsAt: string;
  endsAt: string;
  status: ReservationStatus;
  userId: string;
}

export interface StationRuntimeSnapshot {
  station: StationSummary | null;
  activeSession: SessionSummary | null;
  nextReservation: ReservationSummary | null;
  stationState: "station_unregistered" | "locked" | "active_session";
}

export interface AuditLogSummary {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  stationId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface UpdateStatus {
  status: "idle" | "checking" | "available" | "downloading" | "not_available" | "downloaded" | "error";
  version?: string;
  message?: string;
  percent?: number;
}

export interface UserProfileSummary {
  id: string;
  email: string | null;
  displayName: string | null;
}

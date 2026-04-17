import { roleHierarchy } from "@renderizador/config";
import type {
  AccessCodeSummary,
  AccessDecision,
  MembershipSummary,
  ReservationConflict,
  ReservationSummary,
  Role,
  SessionSummary
} from "@renderizador/types";

const activeReservationStatuses = new Set(["confirmed", "checked_in"]);

export function hasRole(userRoles: Role[], requiredRole: Role): boolean {
  const requiredIndex = roleHierarchy.indexOf(requiredRole);
  return userRoles.some((role) => roleHierarchy.indexOf(role) >= requiredIndex);
}

export function isReservationActive(now: Date, reservation: ReservationSummary | null | undefined): boolean {
  if (!reservation) {
    return false;
  }

  if (!activeReservationStatuses.has(reservation.status)) {
    return false;
  }

  const nowValue = now.getTime();
  return nowValue >= new Date(reservation.startsAt).getTime() && nowValue <= new Date(reservation.endsAt).getTime();
}

export function isAccessCodeValid(now: Date, code: AccessCodeSummary | null | undefined): boolean {
  if (!code) {
    return false;
  }

  if (code.disabledAt) {
    return false;
  }

  if (code.maxUses !== null && code.usedCount >= code.maxUses) {
    return false;
  }

  const nowValue = now.getTime();
  return nowValue >= new Date(code.validFrom).getTime() && nowValue <= new Date(code.validUntil).getTime();
}

export function getAccessDecision(input: {
  reservation?: ReservationSummary | null;
  code?: AccessCodeSummary | null;
  membership?: MembershipSummary | null;
  now?: Date;
}): AccessDecision {
  const now = input.now ?? new Date();
  if (isReservationActive(now, input.reservation)) {
    return { allowed: true, reason: "reservation" };
  }

  if (isAccessCodeValid(now, input.code)) {
    return { allowed: true, reason: "access_code" };
  }

  if (input.membership && hasRole([input.membership.role], "station_admin")) {
    return { allowed: true, reason: "admin_override" };
  }

  return { allowed: false, reason: "no_access" };
}

export function getSessionCountdown(now: Date, session: Pick<SessionSummary, "estimatedEndAt" | "actualEndAt">) {
  if (session.actualEndAt || !session.estimatedEndAt) {
    return {
      remainingMs: 0,
      remainingMinutes: 0,
      warning: false
    };
  }

  const remainingMs = Math.max(new Date(session.estimatedEndAt).getTime() - now.getTime(), 0);
  const remainingMinutes = Math.ceil(remainingMs / 60000);
  return {
    remainingMs,
    remainingMinutes,
    warning: remainingMinutes <= 15
  };
}

export function getSessionWarningLevel(now: Date, session: Pick<SessionSummary, "estimatedEndAt" | "actualEndAt">) {
  if (session.actualEndAt) {
    return "expired" as const;
  }

  if (!session.estimatedEndAt) {
    return "normal" as const;
  }

  const remainingMs = new Date(session.estimatedEndAt).getTime() - now.getTime();
  if (remainingMs <= 0) {
    return "expired" as const;
  }

  const remainingMinutes = Math.ceil(remainingMs / 60000);
  if (remainingMinutes <= 5) {
    return "critical" as const;
  }

  if (remainingMinutes <= 15) {
    return "warning" as const;
  }

  return "normal" as const;
}

export function hasReservationConflict(conflict: ReservationConflict | null | undefined) {
  return Boolean(conflict?.id);
}

export const roleHierarchy = [
  "user",
  "station_admin",
  "org_admin",
  "super_admin"
] as const;

export const reservationStatuses = [
  "draft",
  "confirmed",
  "checked_in",
  "completed",
  "cancelled"
] as const;

export const sessionStates = [
  "pending",
  "active",
  "warning",
  "ended"
] as const;

export const desktopReleaseChannels = [
  "stable",
  "beta"
] as const;

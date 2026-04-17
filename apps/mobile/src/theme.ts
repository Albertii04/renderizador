export const c = {
  bg: "#020617",
  surface: "#0f172a",
  card: "#0f172a",
  border: "#1e293b",
  borderFocus: "#334155",
  muted: "#64748b",
  subtle: "#94a3b8",
  text: "#e2e8f0",
  white: "#f8fafc",
  primary: "#38bdf8",
  primaryPress: "#7dd3fc",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
  info: "#818cf8",
};

export const r = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };

export const STATUS_COLOR: Record<string, string> = {
  pending: "#fbbf24",
  confirmed: "#38bdf8",
  active: "#34d399",
  in_progress: "#34d399",
  completed: "#64748b",
  cancelled: "#f87171",
  normal: "#34d399",
  warning: "#fbbf24",
  critical: "#f87171",
  expired: "#64748b",
};

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}
export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

import { useState } from "react";
import {
  checkStationAccess,
  fetchActiveStationSession,
  fetchReservationById,
  mapAccessDecision,
  mapReservation,
  mapSession,
  recordAuditEvent,
  startStationSession
} from "@renderizador/supabase";
import { useAppStore } from "../stores/app-store";
import { Shell } from "../components/shell";
import { supabase } from "../lib/supabase";

async function sha256(value: string) {
  const content = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", content);
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

function getStateLabel(state: string) {
  if (state === "active_session") {
    return "Session active";
  }

  if (state === "station_unregistered") {
    return "Station setup required";
  }

  return "Ready for access";
}

export function LockedPage() {
  const stationConfig = useAppStore((state) => state.stationConfig);
  const stationState = useAppStore((state) => state.stationState);
  const membership = useAppStore((state) => state.membership);
  const profile = useAppStore((state) => state.profile);
  const nextReservation = useAppStore((state) => state.nextReservation);
  const failedAttempts = useAppStore((state) => state.failedAttempts);
  const lastActionMessage = useAppStore((state) => state.lastActionMessage);
  const busy = useAppStore((state) => state.busy);
  const setAccessCode = useAppStore((state) => state.setAccessCode);
  const setAccessDecision = useAppStore((state) => state.setAccessDecision);
  const setLastActionMessage = useAppStore((state) => state.setLastActionMessage);
  const setMembership = useAppStore((state) => state.setMembership);
  const setReservation = useAppStore((state) => state.setReservation);
  const setScreen = useAppStore((state) => state.setScreen);
  const setSession = useAppStore((state) => state.setSession);
  const setFailedAttempts = useAppStore((state) => state.setFailedAttempts);
  const setBusy = useAppStore((state) => state.setBusy);
  const [codeInput, setCodeInput] = useState("");

  async function createSessionFromDecision(reasonCodeHash?: string) {
    if (!supabase || !stationConfig?.stationId) {
      return;
    }

    setBusy(true);
    const accessResponse = await checkStationAccess(supabase, stationConfig.stationId, reasonCodeHash, stationConfig.stationSecret);
    setBusy(false);

    if (accessResponse.error) {
      setLastActionMessage(accessResponse.error.message);
      return;
    }

    const decision = mapAccessDecision(accessResponse.data);
    setAccessDecision(decision);

    if (!decision.allowed) {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);

      if (stationConfig.organizationId) {
        await recordAuditEvent(supabase, {
          organizationId: stationConfig.organizationId,
          action: "attempt_invalid",
          entityType: "station",
          entityId: stationConfig.stationId,
          stationId: stationConfig.stationId,
          metadata: { failedAttempts: nextAttempts, codeAttempt: Boolean(reasonCodeHash) }
        });
      }

      if (nextAttempts >= 5) {
        setFailedAttempts(0);
        setCodeInput("");
        setLastActionMessage("Too many failed attempts. The station returned to a safe locked state.");
        setScreen("locked");
        return;
      }

      setLastActionMessage("Access denied. No active reservation, valid code, or admin override was found.");
      return;
    }

    setFailedAttempts(0);

    let estimatedMinutes = 120;
    if (decision.reservationId) {
      const reservationResponse = await fetchReservationById(supabase, decision.reservationId);
      if (reservationResponse.data) {
        const reservation = mapReservation(reservationResponse.data);
        estimatedMinutes = reservation.estimatedMinutes;
        setReservation(reservation);
      }
    }

    if (decision.accessCodeId) {
      setAccessCode({
        id: decision.accessCodeId,
        codeHash: reasonCodeHash ?? "",
        displayCode: codeInput.trim() || null,
        stationId: stationConfig.stationId,
        reservationId: decision.reservationId ?? null,
        validFrom: new Date().toISOString(),
        validUntil: new Date().toISOString(),
        maxUses: null,
        usedCount: 0
      });
    }

    const sessionResponse = await startStationSession(supabase, {
      stationId: stationConfig.stationId,
      reservationId: decision.reservationId ?? null,
      accessCodeId: decision.accessCodeId ?? null,
      adminOverride: decision.reason === "admin_override",
      estimatedMinutes,
      stationSecret: stationConfig.stationSecret
    });

    if (sessionResponse.error || !sessionResponse.data) {
      setLastActionMessage(sessionResponse.error?.message ?? "Unable to start session.");
      return;
    }

    setSession(mapSession(sessionResponse.data));

    if (stationConfig.organizationId) {
      await recordAuditEvent(supabase, {
        organizationId: stationConfig.organizationId,
        action: "access_granted",
        entityType: "session",
        entityId: sessionResponse.data.id,
        stationId: stationConfig.stationId,
        metadata: { reason: decision.reason }
      });
    }

    setLastActionMessage(`Access granted via ${decision.reason.replace("_", " ")}.`);
    setScreen("launcher");
  }

  async function resumeIfSessionExists() {
    if (!supabase || !stationConfig?.stationId) {
      return;
    }

    const activeSessionResponse = await fetchActiveStationSession(supabase, stationConfig.stationId, stationConfig.stationSecret);
    if (activeSessionResponse.data) {
      setSession(mapSession(activeSessionResponse.data));
      setLastActionMessage("Recovered the active session for this workstation.");
      setScreen("launcher");
      return;
    }

    setLastActionMessage("There is no active session to recover on this station.");
  }

  return (
    <Shell
      eyebrow="Station access"
      title={stationConfig?.stationName ?? "Renderizador Station"}
      subtitle="Shared workstation access for reservations, time-boxed sessions, and controlled admin support."
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,18,36,0.92),rgba(7,12,27,0.92))] shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
          <div className="border-b border-white/8 px-7 py-6 md:px-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-sky-100">
                {getStateLabel(stationState)}
              </span>
              {nextReservation ? (
                <span className="rounded-full border border-amber-300/25 bg-amber-300/8 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-amber-100">
                  Next reservation {new Date(nextReservation.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              ) : (
                <span className="rounded-full border border-emerald-300/25 bg-emerald-300/8 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-emerald-100">
                  Station available
                </span>
              )}
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
              <div>
                <p className="text-[11px] uppercase tracking-[0.34em] text-slate-400">Access to workstation</p>
                <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-[-0.04em] text-white md:text-4xl">
                  Enter with your reservation or unlock using a valid access code.
                </h2>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-white/4 p-4 text-sm text-slate-300">
                <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Current context</p>
                <div className="mt-3 space-y-2">
                  <p>Station code: <span className="text-white">{stationConfig?.stationCode || "Not configured"}</span></p>
                  <p>Operator: <span className="text-white">{profile?.email ?? "Not signed in"}</span></p>
                  <p>Role: <span className="text-white">{membership?.role ?? "worker"}</span></p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 px-7 py-7 md:grid-cols-[1.05fr_0.95fr] md:px-8">
            <div className="rounded-[26px] border border-white/8 bg-black/16 p-5">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Access code</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white">Unlock this station</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-300">
                Use the code attached to your reservation. The workstation will validate it against Supabase and start a real timed session.
              </p>
              <input
                value={codeInput}
                onChange={(event) => setCodeInput(event.target.value)}
                placeholder="Enter access code"
                className="mt-6 w-full rounded-2xl border border-white/10 bg-[#071024] px-5 py-4 text-lg text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/60"
              />
              <button
                className="mt-4 w-full rounded-2xl bg-sky-400 px-5 py-4 text-base font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy || !codeInput.trim() || !stationConfig?.stationId}
                onClick={() => void sha256(codeInput.trim()).then((hash) => createSessionFromDecision(hash))}
              >
                {busy ? "Checking code..." : "Unlock station"}
              </button>
              {failedAttempts > 0 ? (
                <p className="mt-3 text-sm text-amber-200">
                  Failed attempts: {failedAttempts}/5. The station resets after five invalid tries.
                </p>
              ) : null}
            </div>

            <div className="rounded-[26px] border border-white/8 bg-white/4 p-5">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Reservation access</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white">Use your active booking</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                If the workstation operator is signed in with Microsoft and has a valid live reservation, access can start without typing the code again.
              </p>
              <button
                className="mt-6 w-full rounded-2xl border border-sky-300/25 bg-sky-300/8 px-5 py-4 text-left text-base font-medium text-sky-50 transition hover:border-sky-300/45 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy || !stationConfig?.stationId}
                onClick={() => void createSessionFromDecision()}
              >
                {profile ? "Use active reservation" : "Check for admin override or active reservation"}
              </button>
              {!profile ? (
                <button
                  className="mt-3 w-full rounded-2xl border border-white/10 bg-white/4 px-5 py-4 text-left text-sm font-medium text-white transition hover:border-white/20"
                  onClick={() => setScreen("auth")}
                >
                  Sign in with Microsoft to use reservation detection
                </button>
              ) : null}
              {membership && ["station_admin", "org_admin", "super_admin"].includes(membership.role) ? (
                <button
                  className="mt-3 w-full rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-5 py-4 text-left text-sm font-medium text-emerald-100 transition hover:border-emerald-300/50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={busy}
                  onClick={() => {
                    setMembership(membership);
                    void createSessionFromDecision();
                  }}
                >
                  Unlock with admin override
                </button>
              ) : null}
              {lastActionMessage ? (
                <div className="mt-5 rounded-2xl border border-white/8 bg-[#071024] px-4 py-3 text-sm text-slate-300">
                  {lastActionMessage}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-6">
          <section className="rounded-[28px] border border-white/10 bg-white/4 p-6 shadow-[0_24px_100px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Today on this station</p>
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-white/8 bg-black/16 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Current state</p>
                <p className="mt-2 text-lg font-semibold text-white">{getStateLabel(stationState)}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/16 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Next reservation</p>
                <p className="mt-2 text-sm text-white">
                  {nextReservation
                    ? `${new Date(nextReservation.startsAt).toLocaleString()}`
                    : "No reservation is queued after this slot."}
                </p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/16 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Operator guidance</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {stationConfig?.instructions || "No station instructions configured yet. Add them in station settings."}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-6">
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Support and recovery</p>
            <div className="mt-4 grid gap-3">
              <button
                className="rounded-2xl border border-white/10 bg-white/4 px-4 py-4 text-left text-sm font-medium text-white transition hover:border-white/20"
                onClick={() => void resumeIfSessionExists()}
              >
                Recover active session
              </button>
              <button
                className="rounded-2xl border border-white/10 bg-white/4 px-4 py-4 text-left text-sm font-medium text-white transition hover:border-white/20"
                onClick={() => setScreen("settings")}
              >
                Station settings
              </button>
              <button
                className="rounded-2xl border border-white/10 bg-white/4 px-4 py-4 text-left text-sm font-medium text-white transition hover:border-white/20"
                onClick={() => setScreen("admin")}
              >
                Server and support tools
              </button>
            </div>
          </section>
        </aside>
      </div>
    </Shell>
  );
}

import { useEffect, useState } from "react";
import { endStationSession, fetchStationRuntimeSnapshotWithSecret, recordAuditEvent } from "@renderizador/supabase";
import { getSessionCountdown, getSessionWarningLevel } from "@renderizador/utils";
import { useAppStore } from "../stores/app-store";
import { Shell } from "../components/shell";
import { supabase } from "../lib/supabase";

export function LauncherPage() {
  const session = useAppStore((state) => state.session);
  const reservation = useAppStore((state) => state.reservation);
  const nextReservation = useAppStore((state) => state.nextReservation);
  const setSession = useAppStore((state) => state.setSession);
  const setLastActionMessage = useAppStore((state) => state.setLastActionMessage);
  const lastActionMessage = useAppStore((state) => state.lastActionMessage);
  const setScreen = useAppStore((state) => state.setScreen);
  const stationConfig = useAppStore((state) => state.stationConfig);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!supabase || !stationConfig?.stationId || !stationConfig.stationSecret) {
      return;
    }

    const client = supabase;
    const timer = window.setInterval(() => {
      void fetchStationRuntimeSnapshotWithSecret(client, stationConfig.stationId, stationConfig.stationSecret).then((response) => {
        const activeSession = (response.data as { active_session?: { id?: string } } | null)?.active_session;
        if (!activeSession?.id) {
          setLastActionMessage("This session was closed remotely.");
          setSession(null);
          setScreen("locked");
        }
      });
    }, 15000);

    return () => window.clearInterval(timer);
  }, [setLastActionMessage, setScreen, setSession, stationConfig?.stationId, stationConfig?.stationSecret]);

  if (!session) {
    return (
      <Shell eyebrow="Station runtime" title="No active session" subtitle="The workstation is ready to return to its locked state.">
        <section className="rounded-[28px] border border-white/10 bg-white/4 p-6">
          <button
            className="rounded-2xl border border-white/10 bg-white/4 px-5 py-4 text-white"
            onClick={() => setScreen("locked")}
          >
            Back to lock screen
          </button>
        </section>
      </Shell>
    );
  }

  const activeSession = session;
  const countdown = getSessionCountdown(now, {
    estimatedEndAt: activeSession.estimatedEndAt,
    actualEndAt: activeSession.actualEndAt
  });
  const warningLevel = getSessionWarningLevel(now, activeSession);

  async function endCurrentSession() {
    if (!supabase) {
      setSession(null);
      setScreen("locked");
      return;
    }

    const response = await endStationSession(supabase, activeSession.id, stationConfig?.stationSecret);
    if (response.error) {
      setLastActionMessage(response.error.message);
      return;
    }

    setSession(null);
    setLastActionMessage("Session ended.");
    setScreen("locked");
  }

  async function launchAction(kind: "d5" | "rdp") {
    const result =
      kind === "d5" ? await window.workstation.launchD5() : await window.workstation.launchRemoteDesktop();
    setLastActionMessage(result.message ?? (kind === "d5" ? "D5 launched." : "Remote desktop launched."));

    if (result.ok && supabase && stationConfig?.organizationId && stationConfig.stationId) {
      await recordAuditEvent(supabase, {
        organizationId: stationConfig.organizationId,
        action: kind === "d5" ? "d5_launch" : "rdp_launch",
        entityType: "session",
        entityId: activeSession.id,
        stationId: stationConfig.stationId,
        metadata: { commandConfigured: true }
      });
    }
  }

  return (
    <Shell
      eyebrow="Session active"
      title={stationConfig?.stationName ?? "Session active"}
      subtitle="This workstation is unlocked and operating inside a tracked session."
    >
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,18,36,0.92),rgba(7,12,27,0.92))] p-7 shadow-[0_30px_120px_rgba(0,0,0,0.42)] md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Session countdown</p>
              <h2 className="mt-3 text-6xl font-semibold tracking-[-0.05em] text-white">{countdown.remainingMinutes}</h2>
              <p className="text-sm uppercase tracking-[0.26em] text-slate-400">minutes remaining</p>
            </div>
            <div
              className={`rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.28em] ${
                warningLevel === "expired"
                  ? "border border-rose-300/35 bg-rose-300/10 text-rose-100"
                  : warningLevel === "critical"
                    ? "border border-orange-300/35 bg-orange-300/10 text-orange-100"
                    : warningLevel === "warning"
                      ? "border border-amber-300/35 bg-amber-300/10 text-amber-100"
                      : "border border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
              }`}
            >
              {warningLevel}
            </div>
          </div>

          <p
            className={`mt-5 max-w-2xl text-sm leading-6 ${
              warningLevel === "critical" || warningLevel === "expired"
                ? "text-rose-100"
                : warningLevel === "warning"
                  ? "text-amber-100"
                  : "text-slate-300"
            }`}
          >
            {warningLevel === "expired"
              ? "The reserved window is over. Finish the current task, release the workstation, and prepare for the next operator."
              : warningLevel === "critical"
                ? "This session is critically close to the end. Avoid new heavy actions unless support approves an extension."
                : warningLevel === "warning"
                  ? "The session is approaching its estimated end. Wrap up or request support if the station can be extended."
                  : "The workstation is within the planned booking window."}
          </p>

          <div className="mt-7 grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] border border-white/8 bg-white/4 p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Reservation</p>
              <div className="mt-3 space-y-2 text-sm text-slate-300">
                <p>Project: <span className="text-white">{reservation?.projectName ?? "No project assigned"}</span></p>
                <p>Work type: <span className="text-white">{reservation?.workType ?? "Not specified"}</span></p>
                <p>Started: <span className="text-white">{new Date(activeSession.startsAt).toLocaleString()}</span></p>
                <p>Estimated end: <span className="text-white">{activeSession.estimatedEndAt ? new Date(activeSession.estimatedEndAt).toLocaleString() : "Unknown"}</span></p>
              </div>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-white/4 p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Station context</p>
              <div className="mt-3 space-y-2 text-sm text-slate-300">
                <p>Reason: <span className="text-white">{activeSession.adminOverride ? "Admin override" : activeSession.accessCodeId ? "Access code" : "Reservation"}</span></p>
                <p>User: <span className="text-white">{activeSession.userId ?? "station user"}</span></p>
                <p>State: <span className="text-white">{activeSession.state}</span></p>
                <p>Next reservation: <span className="text-white">{nextReservation ? new Date(nextReservation.startsAt).toLocaleString() : "None"}</span></p>
              </div>
            </div>
          </div>

          {lastActionMessage ? (
            <div className="mt-5 rounded-2xl border border-white/8 bg-[#071024] px-4 py-3 text-sm text-slate-300">
              {lastActionMessage}
            </div>
          ) : null}
        </section>

        <section className="rounded-[30px] border border-white/10 bg-white/4 p-7 shadow-[0_24px_100px_rgba(0,0,0,0.35)] backdrop-blur-xl md:p-8">
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Launcher actions</p>
          <div className="mt-5 grid gap-3">
            <button
              className="rounded-2xl bg-sky-400 px-5 py-4 text-left text-base font-semibold text-slate-950"
              onClick={() => void launchAction("d5")}
            >
              Open D5
            </button>
            <button
              className="rounded-2xl bg-slate-200 px-5 py-4 text-left text-base font-semibold text-slate-950"
              onClick={() => void launchAction("rdp")}
            >
              Open remote desktop
            </button>
            <button
              className="rounded-2xl border border-white/10 bg-white/4 px-5 py-4 text-left text-sm font-medium text-white"
              onClick={() => void window.workstation.openExternalDocs("https://supabase.com/docs/guides/auth/social-login/auth-azure")}
            >
              Instructions
            </button>
            <button
              className="rounded-2xl border border-white/10 bg-white/4 px-5 py-4 text-left text-sm font-medium text-white"
              onClick={() => setScreen("admin")}
            >
              Server and support tools
            </button>
            <button
              className="rounded-2xl border border-rose-500/35 bg-rose-400/8 px-5 py-4 text-left text-sm font-medium text-rose-100"
              onClick={() => void endCurrentSession()}
            >
              End session
            </button>
          </div>
          {nextReservation ? (
            <p className="mt-5 text-sm leading-6 text-amber-100">
              Conflict warning: the next reservation starts at {new Date(nextReservation.startsAt).toLocaleString()}.
            </p>
          ) : null}
        </section>
      </div>
    </Shell>
  );
}

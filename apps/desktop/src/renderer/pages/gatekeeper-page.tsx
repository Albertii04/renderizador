import { useEffect, useState } from "react";
import {
  checkStationAccess,
  checkStationPairing,
  fetchActiveStationSession,
  mapAccessDecision,
  mapSession,
  startStationSession
} from "@renderizador/supabase";
import { getSessionCountdown } from "@renderizador/utils";
import { useAppStore } from "../stores/app-store";
import { supabase } from "../lib/supabase";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function GatekeeperPage() {
  const stationConfig = useAppStore((state) => state.stationConfig);
  const session = useAppStore((state) => state.session);
  const setSession = useAppStore((state) => state.setSession);
  const setScreen = useAppStore((state) => state.setScreen);
  const [codeInput, setCodeInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Tick for countdown
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Lock the app as fullscreen kiosk whenever we're idle (no active session).
  // When a session starts we unlock and hide to tray so the worker can use RDP.
  // When it ends we re-lock on the full screen.
  // When the station is in free-access mode (admin testing), never lock: stay
  // unlocked and hidden to tray so the OS is freely usable as if the app
  // wasn't installed.
  useEffect(() => {
    if (stationConfig?.freeAccess) {
      void (async () => {
        await window.workstation.unlockKiosk();
        await window.workstation.hideToTray();
      })();
      return;
    }
    if (session) {
      void (async () => {
        await window.workstation.unlockKiosk();
        await window.workstation.hideToTray();
      })();
    } else {
      void window.workstation.lockKiosk();
    }
  }, [session, stationConfig?.freeAccess]);

  // Main process emits `kiosk:force-relock` on OS-level session events (screen
  // unlock/lock, resume from sleep, user became active). On Windows, an RDP
  // disconnect triggers the same `lock-screen` event that Win+L does, so this
  // also covers remote-desktop disconnects. Always terminate any live Supabase
  // session and bring the fullscreen code prompt back.
  useEffect(() => {
    const off = window.workstation.onForceRelock(() => {
      void (async () => {
        const current = useAppStore.getState().session;
        if (current && supabase) {
          const { endStationSession } = await import("@renderizador/supabase");
          await endStationSession(supabase, current.id, stationConfig?.stationSecret);
        }
        setSession(null);
        setCodeInput("");
        setMessage(null);
        await window.workstation.showWindow();
        await window.workstation.lockKiosk();
      })();
    });
    return off;
  }, [setSession, stationConfig?.stationSecret]);

  // Cross-check: while we believe a session is active, poll Supabase every 10
  // seconds. If the backend says the session is gone (admin revoked, expiry
  // RPC, another process ended it) force the kiosk back to the locked state.
  useEffect(() => {
    if (!session || !supabase || !stationConfig?.stationId) return;
    let cancelled = false;
    const check = async () => {
      if (!supabase || !stationConfig?.stationId) return;
      const resp = await fetchActiveStationSession(
        supabase,
        stationConfig.stationId,
        stationConfig.stationSecret
      );
      if (cancelled) return;
      if (!resp.data) {
        setSession(null);
        setCodeInput("");
        setMessage(null);
        await window.workstation.showWindow();
        await window.workstation.lockKiosk();
      }
    };
    const timer = window.setInterval(() => void check(), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session, stationConfig?.stationId, stationConfig?.stationSecret, setSession]);

  // Poll remote pairing state; if admin unpaired from mobile, wipe local config and return to pairing.
  useEffect(() => {
    if (!supabase || !stationConfig?.stationId) return;
    let cancelled = false;
    async function check() {
      if (!supabase || !stationConfig?.stationId) return;
      const resp = await checkStationPairing(supabase, {
        stationId: stationConfig.stationId,
        stationSecret: stationConfig.stationSecret
      });
      if (cancelled) return;
      if (resp.data && typeof resp.data.free_access === "boolean") {
        const current = useAppStore.getState().stationConfig;
        if (current && current.freeAccess !== resp.data.free_access) {
          const updated = await window.workstation.saveStationConfig({ freeAccess: resp.data.free_access });
          useAppStore.getState().setStationConfig(updated);
          // Apply the kiosk state directly here too. The lock effect below
          // depends on a React deps change and has occasionally missed the
          // false→true transition in the field; calling the IPCs inline
          // makes this deterministic regardless of effect timing.
          if (resp.data.free_access) {
            await window.workstation.unlockKiosk();
            await window.workstation.hideToTray();
          } else if (!useAppStore.getState().session) {
            await window.workstation.showWindow();
            await window.workstation.lockKiosk();
          }
        }
      }
      if (resp.data && resp.data.paired === false) {
        // End any live session locally; the station secret has just been
        // rotated server-side so end_station_session would fail anyway, but
        // we clear local state for a clean pairing flow.
        const current = useAppStore.getState().session;
        if (current && supabase) {
          const { endStationSession } = await import("@renderizador/supabase");
          await endStationSession(supabase, current.id, stationConfig?.stationSecret);
        }
        setSession(null);
        const config = await window.workstation.saveStationConfig({
          stationId: "", stationCode: "", stationName: "", organizationId: "",
          stationSecret: "", rdpHost: "", rdpWindowsUsername: "", rdpWindowsPassword: "",
          instructions: "", d5ExecutablePath: "", rdpCommand: "", freeAccess: false
        });
        useAppStore.getState().setStationConfig(config);
        setScreen("pairing");
        // Make sure the operator actually sees the pairing screen even if
        // the app was hidden in the tray during an active session.
        await window.workstation.showWindow();
        await window.workstation.lockKiosk();
      }
    }
    void check();
    const timer = window.setInterval(() => void check(), 15000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [stationConfig?.stationId, stationConfig?.stationSecret, setScreen]);

  async function validate() {
    if (!supabase || !stationConfig?.stationId || !codeInput.trim()) return;

    setBusy(true);
    setMessage(null);

    const hash = await sha256(codeInput.trim());
    const accessResp = await checkStationAccess(supabase, stationConfig.stationId, hash, stationConfig.stationSecret);

    if (accessResp.error) {
      setBusy(false);
      setMessage(accessResp.error.message);
      return;
    }

    const decision = mapAccessDecision(accessResp.data);

    if (!decision.allowed) {
      setBusy(false);
      setMessage("Código no válido o sin reserva activa.");
      return;
    }

    const activeResp = await fetchActiveStationSession(supabase, stationConfig.stationId, stationConfig.stationSecret);
    if (activeResp.data) {
      setBusy(false);
      setSession(mapSession(activeResp.data));
      setCodeInput("");
      setMessage(null);
      return;
    }

    const sessionResp = await startStationSession(supabase, {
      stationId: stationConfig.stationId,
      reservationId: decision.reservationId ?? null,
      accessCodeId: decision.accessCodeId ?? null,
      adminOverride: decision.reason === "admin_override",
      estimatedMinutes: 120,
      stationSecret: stationConfig.stationSecret
    });

    setBusy(false);

    if (sessionResp.error || !sessionResp.data) {
      setMessage(sessionResp.error?.message ?? "No se pudo iniciar la sesión.");
      return;
    }

    setSession(mapSession(sessionResp.data));
    setCodeInput("");
    setMessage(null);
  }

  async function endSession() {
    if (!session) return;
    if (supabase) {
      const { endStationSession } = await import("@renderizador/supabase");
      await endStationSession(supabase, session.id, stationConfig?.stationSecret);
    }
    setSession(null);
    setMessage("Sesión finalizada.");
  }

  const countdown = session
    ? getSessionCountdown(now, { estimatedEndAt: session.estimatedEndAt, actualEndAt: session.actualEndAt })
    : null;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(117,163,255,0.12),transparent_28%),linear-gradient(180deg,#050816_0%,#060b1c_55%,#0a1020_100%)]" />

      {/* top bar */}
      <div className="relative flex items-center justify-between px-8 py-5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.4em] text-sky-200/60">Renderizador · Servidor</p>
          <p className="mt-1 text-lg font-semibold text-white">{stationConfig?.stationName || "Estación sin nombre"}</p>
        </div>
      </div>

      <div className="relative flex min-h-[calc(100vh-80px)] flex-col items-center justify-center px-6">
        {session ? (
          /* Session active */
          <div className="w-full max-w-md">
            <div className="rounded-[32px] border border-emerald-400/20 bg-emerald-400/6 p-10 text-center">
              <span className="inline-flex h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.8)]" />
              <h2 className="mt-6 text-4xl font-semibold tracking-[-0.03em] text-white">Estación en uso</h2>
              {countdown && (
                <p className="mt-3 text-6xl font-semibold tabular-nums text-emerald-300">
                  {countdown.remainingMinutes}
                  <span className="ml-2 text-lg font-normal text-slate-400">min</span>
                </p>
              )}
              <p className="mt-4 text-sm text-slate-400">Sesión iniciada el {new Date(session.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
              <button
                className="mt-8 w-full rounded-2xl border border-rose-500/30 bg-rose-400/8 px-5 py-4 text-sm font-medium text-rose-200 transition hover:border-rose-500/50"
                onClick={() => void endSession()}
              >
                Finalizar sesión
              </button>
            </div>
            {message && <p className="mt-4 text-center text-sm text-slate-400">{message}</p>}
          </div>
        ) : (
          /* Waiting for access code */
          <div className="w-full max-w-md">
            <div className="rounded-[32px] border border-white/10 bg-white/4 p-10">
              <span className="inline-flex h-3 w-3 rounded-full bg-slate-500" />
              <h2 className="mt-6 text-4xl font-semibold tracking-[-0.03em] text-white">Estación libre</h2>
              <p className="mt-3 text-sm text-slate-400">
                Introduce el código temporal de tu reserva para iniciar sesión.
              </p>
              <input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void validate(); }}
                placeholder="Código de acceso"
                className="mt-8 w-full rounded-2xl border border-white/10 bg-[#071024] px-5 py-4 text-center text-xl tracking-[0.15em] text-white outline-none transition placeholder:text-slate-600 focus:border-sky-400/60"
              />
              <button
                className="mt-4 w-full rounded-2xl bg-sky-400 px-5 py-4 text-base font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy || !codeInput.trim()}
                onClick={() => void validate()}
              >
                {busy ? "Verificando..." : "Acceder"}
              </button>
              {message && (
                <p className="mt-4 text-center text-sm text-rose-300">{message}</p>
              )}
            </div>

          </div>
        )}
      </div>
    </main>
  );
}

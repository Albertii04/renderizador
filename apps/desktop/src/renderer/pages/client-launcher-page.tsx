import { useState } from "react";
import { useAppStore } from "../stores/app-store";
import { supabase } from "../lib/supabase";

export function ClientLauncherPage() {
  const profile = useAppStore((state) => state.profile);
  const stationConfig = useAppStore((state) => state.stationConfig);
  const lastActionMessage = useAppStore((state) => state.lastActionMessage);
  const setScreen = useAppStore((state) => state.setScreen);
  const setProfile = useAppStore((state) => state.setProfile);
  const setMembership = useAppStore((state) => state.setMembership);
  const setLastActionMessage = useAppStore((state) => state.setLastActionMessage);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const host = stationConfig?.rdpHost ?? "";
  const username = stationConfig?.rdpWindowsUsername ?? "";
  const password = stationConfig?.rdpWindowsPassword ?? "";

  async function connect() {
    if (!host) {
      setMessage("Tu organización no tiene un servidor listo para este flujo. Revisa la configuración de estaciones desde administración.");
      return;
    }
    setBusy(true);
    const result = await window.workstation.connectRdp({ host, username, password });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message ?? "No se pudo conectar.");
    }
  }

  async function signOut() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setProfile(null);
    setMembership(null);
    setLastActionMessage("Signed out.");
    setScreen("auth");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.10),transparent_28%),linear-gradient(180deg,#050816_0%,#060b1c_55%,#0a1020_100%)]" />

      {/* top bar */}
      <div className="relative flex items-center justify-between px-8 py-5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.4em] text-sky-200/60">Renderizador · Cliente</p>
          {profile?.displayName && (
            <p className="mt-1 text-sm font-medium text-white">{profile.displayName}</p>
          )}
          <p className={`text-xs text-slate-400 ${profile?.displayName ? "" : "mt-1"}`}>{profile?.email ?? "No identificado"}</p>
        </div>
        <div className="flex gap-3">
          <button
            className="rounded-xl border border-white/10 bg-white/4 px-4 py-2 text-xs text-slate-400 transition hover:text-white"
            onClick={() => setScreen("settings")}
          >
            Modo
          </button>
          <button
            className="rounded-xl border border-white/10 bg-white/4 px-4 py-2 text-xs text-slate-400 transition hover:text-white"
            onClick={() => void signOut()}
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      <div className="relative flex min-h-[calc(100vh-80px)] flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <p className="text-[11px] uppercase tracking-[0.4em] text-slate-500">Conectar a</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-white">
            {stationConfig?.stationName || host || "Sin servidor asignado"}
          </h2>
          {stationConfig?.stationCode ? (
            <p className="mt-2 text-sm text-slate-500">Estación {stationConfig.stationCode}</p>
          ) : null}
          {username && (
            <p className="mt-2 text-sm text-slate-500">Usuario remoto: {username}</p>
          )}

          <button
            className="mt-10 w-full rounded-2xl bg-emerald-400 px-6 py-5 text-lg font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || !host}
            onClick={() => void connect()}
          >
            {busy ? "Abriendo conexión..." : "Conectar al servidor"}
          </button>

          {!host && (
            <p className="mt-4 text-sm leading-6 text-slate-400">
              Esta app cliente ya no configura manualmente el servidor. Debe venir asignado desde Supabase.
            </p>
          )}

          {message && (
            <p className="mt-6 rounded-2xl border border-white/8 bg-[#071024] px-4 py-3 text-sm text-slate-300">
              {message}
            </p>
          )}
          {!message && lastActionMessage ? (
            <p className="mt-6 rounded-2xl border border-white/8 bg-[#071024] px-4 py-3 text-sm text-slate-300">
              {lastActionMessage}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}

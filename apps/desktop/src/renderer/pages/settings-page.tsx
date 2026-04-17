import { useState } from "react";
import { useAppStore } from "../stores/app-store";

export function SettingsPage() {
  const current = useAppStore((state) => state.stationConfig);
  const setStationConfig = useAppStore((state) => state.setStationConfig);
  const setScreen = useAppStore((state) => state.setScreen);

  const [mode, setMode] = useState<"server" | "client" | "">(current?.mode ?? "");

  async function saveMode() {
    const nextMode = mode;
    const config = await window.workstation.saveStationConfig({ mode: nextMode });
    setStationConfig(config);
    if (nextMode === "server") {
      setScreen(config.stationId && config.stationCode ? "gatekeeper" : "pairing");
    } else if (nextMode === "client") {
      setScreen("auth");
    } else {
      setScreen("mode-select");
    }
  }

  async function unpair() {
    const config = await window.workstation.saveStationConfig({
      stationId: "",
      stationCode: "",
      stationName: "",
      organizationId: "",
      stationSecret: "",
      rdpHost: "",
      rdpWindowsUsername: "",
      rdpWindowsPassword: "",
      instructions: "",
      d5ExecutablePath: "",
      rdpCommand: ""
    });
    setStationConfig(config);
    setScreen("pairing");
  }

  const back = () =>
    setScreen(current?.mode === "server" ? "gatekeeper" : current?.mode === "client" ? "client-launcher" : "mode-select");

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(117,163,255,0.10),transparent_28%),linear-gradient(180deg,#050816_0%,#060b1c_100%)]" />

      <div className="relative mx-auto max-w-lg px-6 py-10">
        <div className="mb-8 flex items-center gap-4">
          <button className="text-sm text-slate-500 hover:text-white" onClick={back}>←</button>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Ajustes</h1>
        </div>

        <div className="space-y-6">
          <section className="rounded-[24px] border border-white/8 bg-white/4 p-6">
            <p className="mb-4 text-xs uppercase tracking-[0.3em] text-slate-400">Modo</p>
            <div className="grid grid-cols-2 gap-3">
              {(["server", "client"] as const).map((m) => (
                <button
                  key={m}
                  className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                    mode === m
                      ? "border-sky-400/50 bg-sky-400/10 text-sky-200"
                      : "border-white/10 bg-white/4 text-slate-400 hover:text-white"
                  }`}
                  onClick={() => setMode(m)}
                >
                  {m === "server" ? "Servidor" : "Cliente"}
                </button>
              ))}
            </div>
            <button
              className="mt-4 w-full rounded-xl bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-300"
              onClick={() => void saveMode()}
            >
              Guardar
            </button>
          </section>

          {mode === "server" && current?.stationId ? (
            <section className="rounded-[24px] border border-white/8 bg-white/4 p-6">
              <p className="mb-4 text-xs uppercase tracking-[0.3em] text-slate-400">Estación vinculada</p>
              <p className="text-base font-semibold text-white">{current.stationName || "—"}</p>
              <p className="mt-1 text-xs text-slate-400">Código: {current.stationCode}</p>
              <button
                className="mt-4 w-full rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-200 hover:bg-rose-400/20"
                onClick={() => void unpair()}
              >
                Desvincular y escanear nuevo código
              </button>
            </section>
          ) : null}

          {mode === "client" ? (
            <section className="rounded-[24px] border border-white/8 bg-white/4 p-6">
              <p className="mb-4 text-xs uppercase tracking-[0.3em] text-slate-400">Cliente</p>
              <p className="text-sm leading-6 text-slate-300">
                En modo cliente, el servidor remoto se resuelve desde Supabase usando la organización del usuario que inicia sesión.
              </p>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}

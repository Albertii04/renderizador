import { useAppStore } from "../stores/app-store";

export function ModeSelectPage() {
  const setScreen = useAppStore((state) => state.setScreen);
  const setStationConfig = useAppStore((state) => state.setStationConfig);
  const stationConfig = useAppStore((state) => state.stationConfig);

  async function selectMode(mode: "server" | "client") {
    const saved = await window.workstation.saveStationConfig({ mode });
    setStationConfig(saved);
    if (mode === "server") {
      setScreen(saved.stationId && saved.stationCode ? "gatekeeper" : "pairing");
    } else {
      setScreen("auth");
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(117,163,255,0.14),transparent_28%),linear-gradient(180deg,#050816_0%,#060b1c_55%,#0a1020_100%)]" />
      <div className="relative flex min-h-screen flex-col items-center justify-center px-6">
        <p className="text-[11px] uppercase tracking-[0.42em] text-sky-200/80">Renderizador</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-[-0.03em] text-white">¿Cómo usarás esta máquina?</h1>
        <p className="mt-4 text-base text-slate-400">Elige el modo. Puedes cambiarlo después desde ajustes.</p>

        <div className="mt-12 grid w-full max-w-2xl gap-4 md:grid-cols-2">
          <button
            className="group flex flex-col rounded-[28px] border border-white/10 bg-white/4 p-8 text-left transition hover:border-sky-400/40 hover:bg-sky-400/6"
            onClick={() => void selectMode("server")}
          >
            <span className="text-3xl">🖥️</span>
            <h2 className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-white">Servidor</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Esta máquina actúa como estación de trabajo. Controla el acceso mediante códigos temporales de reserva.
            </p>
          </button>

          <button
            className="group flex flex-col rounded-[28px] border border-white/10 bg-white/4 p-8 text-left transition hover:border-emerald-400/40 hover:bg-emerald-400/6"
            onClick={() => void selectMode("client")}
          >
            <span className="text-3xl">💻</span>
            <h2 className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-white">Cliente</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Desde aquí te conectas al servidor de tu organización vía escritorio remoto.
            </p>
          </button>
        </div>

        {stationConfig && (
          <button
            className="mt-8 text-sm text-slate-500 underline underline-offset-4 hover:text-slate-300"
            onClick={() => setScreen("settings")}
          >
            Ajustes avanzados
          </button>
        )}
      </div>
    </main>
  );
}

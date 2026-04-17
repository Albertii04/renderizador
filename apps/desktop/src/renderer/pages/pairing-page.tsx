import { useState } from "react";
import { claimStationPairing } from "@renderizador/supabase";
import { supabase } from "../lib/supabase";
import { useAppStore } from "../stores/app-store";

export function PairingPage() {
  const setScreen = useAppStore((state) => state.setScreen);
  const setStationConfig = useAppStore((state) => state.setStationConfig);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!supabase) {
      setError("Supabase no está configurado.");
      return;
    }
    const normalized = code.trim().toUpperCase();
    if (normalized.length < 4) {
      setError("Introduce el código completo.");
      return;
    }

    setBusy(true);
    setError(null);
    const response = await claimStationPairing(supabase, normalized);
    setBusy(false);

    if (response.error || !response.data?.ok) {
      const message = response.error?.message ?? "Código inválido o expirado.";
      setError(/invalid_or_expired/i.test(message) ? "Código inválido o expirado." : message);
      return;
    }

    const data = response.data;
    const metadata = (data.metadata ?? {}) as Record<string, unknown>;
    const saved = await window.workstation.saveStationConfig({
      mode: "server",
      stationId: data.station_id,
      stationCode: data.station_code,
      stationName: data.station_name,
      organizationId: data.organization_id,
      stationSecret: data.station_secret,
      instructions: typeof metadata.instructions === "string" ? metadata.instructions : "",
      d5ExecutablePath: typeof metadata.d5ExecutablePath === "string" ? metadata.d5ExecutablePath : "",
      rdpCommand: typeof metadata.rdpCommand === "string" ? metadata.rdpCommand : "",
      rdpHost: typeof metadata.rdpHost === "string" ? metadata.rdpHost : "",
      rdpWindowsUsername: typeof metadata.rdpWindowsUsername === "string" ? metadata.rdpWindowsUsername : "",
      rdpWindowsPassword: typeof metadata.rdpWindowsPassword === "string" ? metadata.rdpWindowsPassword : ""
    });
    setStationConfig(saved);
    setScreen("gatekeeper");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(117,163,255,0.14),transparent_28%),linear-gradient(180deg,#050816_0%,#060b1c_55%,#0a1020_100%)]" />
      <div className="relative flex min-h-screen flex-col items-center justify-center px-6">
        <p className="text-[11px] uppercase tracking-[0.42em] text-sky-200/80">Renderizador · Servidor</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-[-0.03em] text-white">Vincular estación</h1>
        <p className="mt-4 max-w-lg text-center text-base text-slate-400">
          Introduce el código de un solo uso generado desde la app móvil por un administrador.
        </p>

        <div className="mt-10 flex w-full max-w-md flex-col gap-4">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={12}
            autoFocus
            spellCheck={false}
            placeholder="ABCD1234"
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-5 text-center text-3xl font-bold tracking-[0.4em] text-sky-100 placeholder:text-slate-600 focus:border-sky-400/60 focus:outline-none"
          />

          {error && <p className="text-center text-sm text-rose-300">{error}</p>}

          <button
            onClick={() => void submit()}
            disabled={busy || code.trim().length === 0}
            className="rounded-2xl bg-sky-400 px-6 py-4 text-base font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Vinculando…" : "Vincular"}
          </button>

        </div>
      </div>
    </main>
  );
}

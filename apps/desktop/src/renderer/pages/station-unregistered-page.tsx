import { Card } from "@renderizador/ui";
import { Shell } from "../components/shell";
import { useAppStore } from "../stores/app-store";

export function StationUnregisteredPage() {
  const setScreen = useAppStore((state) => state.setScreen);

  return (
    <Shell eyebrow="Station setup" title="Workstation not registered">
      <Card title="Registration required" subtitle="This Electron installation needs a station binding before it can enter lock mode.">
        <p className="text-slate-300">
          Use the server/admin side to bind this desktop to a real station code, then save the launcher path and RDP host details.
        </p>
        <button
          className="mt-4 rounded-xl bg-sky-400 px-4 py-3 font-medium text-slate-950"
          onClick={() => setScreen("settings")}
        >
          Open station settings
        </button>
      </Card>
    </Shell>
  );
}

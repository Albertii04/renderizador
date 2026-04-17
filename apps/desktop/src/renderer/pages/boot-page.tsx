import { Card } from "@renderizador/ui";
import { Shell } from "../components/shell";

export function BootPage() {
  return (
    <Shell eyebrow="Renderizador" title="Booting station">
      <div className="grid flex-1 place-items-center">
        <Card title="Loading local station state" subtitle="Checking configuration and update status.">
          <div className="h-2 rounded-full bg-slate-800">
            <div className="h-2 w-1/2 animate-pulse rounded-full bg-sky-400" />
          </div>
        </Card>
      </div>
    </Shell>
  );
}

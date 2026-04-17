import { Card } from "@renderizador/ui";
import { useAppStore } from "../stores/app-store";
import { Shell } from "../components/shell";
import { supabase } from "../lib/supabase";

export function AdminPage() {
  const profile = useAppStore((state) => state.profile);
  const membership = useAppStore((state) => state.membership);
  const setLastActionMessage = useAppStore((state) => state.setLastActionMessage);
  const setMembership = useAppStore((state) => state.setMembership);
  const setProfile = useAppStore((state) => state.setProfile);
  const setScreen = useAppStore((state) => state.setScreen);

  async function signOut() {
    if (!supabase) {
      setScreen("locked");
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      setLastActionMessage(error.message);
      return;
    }

    setMembership(null);
    setProfile(null);
    setLastActionMessage("Signed out from Microsoft.");
    setScreen("locked");
  }

  return (
    <Shell
      eyebrow="Server / Admin"
      title="Station administration"
      actions={
        <>
          <button
            className="rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-100"
            onClick={() => setScreen("locked")}
          >
            Open worker interface
          </button>
          {!profile ? (
            <button
              className="rounded-xl bg-sky-400 px-4 py-3 text-sm font-medium text-slate-950"
              onClick={() => setScreen("auth")}
            >
              Sign in with Microsoft
            </button>
          ) : (
            <button
              className="rounded-xl border border-rose-500/40 px-4 py-3 text-sm text-rose-200"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          )}
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Session context" subtitle="Who is operating this station server interface right now.">
          <div className="space-y-2 text-sm text-slate-300">
            <p>Account: <span className="text-white">{profile?.email ?? "Not signed in"}</span></p>
            <p>Role: <span className="text-white">{membership?.role ?? "No org membership loaded"}</span></p>
          </div>
        </Card>
        <Card title="Local admin controls" subtitle="Manage this station from the server/admin side.">
          <p className="text-slate-300">
            This MVP keeps admin mode intentionally narrow. Station-scoped operations remain in Electron, while broader organization
            management lives in the mobile app.
          </p>
        </Card>
      </div>
    </Shell>
  );
}

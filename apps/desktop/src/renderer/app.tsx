import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Component, type ReactNode } from "react";
import { useBootstrap } from "./hooks/use-bootstrap";
import { useAppStore } from "./stores/app-store";
import { AdminPage } from "./pages/admin-page";
import { AuthPage } from "./pages/auth-page";
import { BootPage } from "./pages/boot-page";
import { ClientLauncherPage } from "./pages/client-launcher-page";
import { GatekeeperPage } from "./pages/gatekeeper-page";
import { LauncherPage } from "./pages/launcher-page";
import { LockedPage } from "./pages/locked-page";
import { ModeSelectPage } from "./pages/mode-select-page";
import { PairingPage } from "./pages/pairing-page";
import { SettingsPage } from "./pages/settings-page";
import { StationUnregisteredPage } from "./pages/station-unregistered-page";

const queryClient = new QueryClient();

class RendererErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  override componentDidCatch(error: Error) {
    console.error("Renderer crashed", error);
  }

  override render() {
    if (this.state.error) {
      return (
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "32px",
            background:
              "radial-gradient(circle at top, rgba(56, 189, 248, 0.18), transparent 30%), linear-gradient(180deg, #020617 0%, #020617 45%, #0f172a 100%)",
            color: "#f8fafc"
          }}
        >
          <section
            style={{
              width: "100%",
              maxWidth: "720px",
              borderRadius: "24px",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(15, 23, 42, 0.78)",
              padding: "24px"
            }}
          >
            <p style={{ margin: 0, letterSpacing: "0.2em", textTransform: "uppercase", color: "#7dd3fc", fontSize: "12px" }}>
              Renderer Error
            </p>
            <h1 style={{ margin: "16px 0 12px", fontSize: "32px" }}>Desktop app failed to render</h1>
            <p style={{ margin: 0, color: "#cbd5e1" }}>{this.state.error}</p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

function DesktopScreens() {
  useBootstrap();
  const screen = useAppStore((state) => state.screen);

  if (screen === "boot") return <BootPage />;
  if (screen === "mode-select") return <ModeSelectPage />;
  if (screen === "pairing") return <PairingPage />;
  if (screen === "auth") return <AuthPage />;
  if (screen === "gatekeeper") return <GatekeeperPage />;
  if (screen === "client-launcher") return <ClientLauncherPage />;
  if (screen === "launcher") return <LauncherPage />;
  if (screen === "admin") return <AdminPage />;
  if (screen === "settings") return <SettingsPage />;
  if (screen === "station-unregistered") return <StationUnregisteredPage />;
  return <LockedPage />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RendererErrorBoundary>
        <DesktopScreens />
      </RendererErrorBoundary>
    </QueryClientProvider>
  );
}

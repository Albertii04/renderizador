import { useEffect } from "react";
import {
  fetchActiveStationSession,
  fetchCurrentProfile,
  fetchMemberships,
  fetchStations,
  mapMembership,
  mapProfile,
  mapStation,
  mapSession
} from "@renderizador/supabase";
import { supabase } from "../lib/supabase";
import { useAppStore } from "../stores/app-store";

export function useBootstrap() {
  const setScreen = useAppStore((state) => state.setScreen);
  const setStationConfig = useAppStore((state) => state.setStationConfig);
  const setUpdateStatus = useAppStore((state) => state.setUpdateStatus);
  const setProfile = useAppStore((state) => state.setProfile);
  const setMembership = useAppStore((state) => state.setMembership);
  const setSession = useAppStore((state) => state.setSession);
  const setLastActionMessage = useAppStore((state) => state.setLastActionMessage);

  useEffect(() => {
    async function bootstrap() {
      try {
        const config = await window.workstation.getStationConfig();
        setStationConfig(config);

        // No mode selected yet → show mode selection
        if (!config.mode) {
          setScreen("mode-select");
          return;
        }

        if (config.mode === "server") {
          if (!config.stationId || !config.stationCode) {
            setScreen("pairing");
            return;
          }

          // Server mode: recover any active session, then show gatekeeper
          if (supabase && config.stationId) {
            const activeResp = await fetchActiveStationSession(supabase, config.stationId, config.stationSecret);
            if (activeResp.data) {
              setSession(mapSession(activeResp.data));
            }
          }
          setScreen("gatekeeper");
          return;
        }

        // Client mode: requires Microsoft login
        if (!supabase) {
          setScreen("auth");
          return;
        }

        const { data: authData } = await supabase.auth.getUser();

        if (!authData.user) {
          setScreen("auth");
          return;
        }

        const [profileResp, membershipsResp] = await Promise.all([
          fetchCurrentProfile(supabase),
          fetchMemberships(supabase)
        ]);

        if (profileResp.data) {
          setProfile(mapProfile(profileResp.data));
        } else {
          setProfile({
            id: authData.user.id,
            email: authData.user.email ?? null,
            displayName: authData.user.user_metadata?.full_name ?? authData.user.user_metadata?.name ?? null
          });
        }

        const membership =
          membershipsResp.data?.find((m) => m.organization_id === config.organizationId) ??
          membershipsResp.data?.[0];
        if (membership) {
          const mappedMembership = mapMembership(membership);
          setMembership(mappedMembership);

          const stationsResp = await fetchStations(supabase);
          const clientStations = (stationsResp.data ?? [])
            .map(mapStation)
            .filter((station) =>
              station.organizationId === mappedMembership.organizationId &&
              station.enabled &&
              station.rdpHost
            );

          const preferredStation =
            clientStations.find((station) => station.id === config.stationId) ??
            clientStations[0];

          if (preferredStation) {
            setStationConfig({
              ...config,
              stationId: preferredStation.id,
              stationCode: preferredStation.stationCode,
              stationName: preferredStation.name,
              organizationId: preferredStation.organizationId,
              rdpHost: preferredStation.rdpHost ?? "",
              rdpWindowsUsername: preferredStation.rdpWindowsUsername ?? "",
              rdpWindowsPassword: preferredStation.rdpWindowsPassword ?? ""
            });
            setLastActionMessage(`Conectado como ${authData.user.email ?? "usuario"}. Servidor: ${preferredStation.name}.`);
          } else {
            setLastActionMessage("Conectado, pero tu organización no tiene un servidor RDP configurado.");
          }
        } else if (config.organizationId) {
          setLastActionMessage("This user does not belong to the configured organization.");
        } else {
          setLastActionMessage("Conectado, pero no se encontró una organización asociada.");
        }
        setScreen("client-launcher");
      } catch (error) {
        console.error("Bootstrap failed", error);
        setLastActionMessage(error instanceof Error ? error.message : "Error al arrancar.");
        setScreen("settings");
      }
    }

    void bootstrap();

    const authSubscription = supabase
      ? supabase.auth.onAuthStateChange(() => void bootstrap()).data.subscription
      : null;

    const unsubscribe = window.workstation.onUpdateStatus((payload) => {
      setUpdateStatus(payload);
    });

    return () => {
      authSubscription?.unsubscribe();
      unsubscribe();
    };
  }, [setLastActionMessage, setMembership, setProfile, setScreen, setSession, setStationConfig, setUpdateStatus]);
}

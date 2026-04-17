import type { PropsWithChildren } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import {
  type AccessPolicy,
  assignStationReleaseChannel as assignStationReleaseChannelQuery,
  createOrganization as createOrganizationQuery,
  cancelReservation as cancelReservationQuery,
  createAdminAccessCode as createAdminAccessCodeQuery,
  createReservationWithCode,
  createStation as createStationQuery,
  extendStationSession,
  generateStationPairingCode as generateStationPairingCodeQuery,
  unpairStation as unpairStationQuery,
  deleteStation as deleteStationQuery,
  fetchAccessCodes,
  fetchAllReservations,
  fetchAllSessions,
  fetchAuditLogs,
  fetchCurrentProfile,
  fetchDesktopAppVersions,
  fetchMemberships,
  fetchReleaseChannels,
  fetchReservationsForUser,
  fetchStationCatalog,
  fetchStations,
  mapAccessCode,
  mapAuditLog,
  mapMembership,
  mapProfile,
  mapReservation,
  mapStation,
  mapStationCatalog,
  moveReservation as moveReservationQuery,
  revokeAccessCode as revokeAccessCodeQuery,
  revokeStationSession,
  updateMembershipRole,
  updateStation as updateStationQuery
} from "@renderizador/supabase";
import type {
  AccessCodeSummary,
  AuditLogSummary,
  MembershipSummary,
  ReservationSummary,
  Role,
  SessionSummary,
  StationRuntimeSnapshot,
  StationSummary,
  UserProfileSummary
} from "@renderizador/types";
import { supabase } from "../lib/supabase";

interface AppContextValue {
  signedIn: boolean;
  loading: boolean;
  roles: Role[];
  memberships: MembershipSummary[];
  reservations: ReservationSummary[];
  stations: StationSummary[];
  stationCatalog: StationRuntimeSnapshot[];
  sessions: SessionSummary[];
  accessCodes: AccessCodeSummary[];
  auditLogs: AuditLogSummary[];
  profile: UserProfileSummary | null;
  releaseChannels: Array<{ id: string; name: string; description: string | null }>;
  releaseVersions: Array<{ id: string; channelId: string; version: string; notes: string | null }>;
  signIn(): Promise<{ ok: boolean; message?: string }>;
  signOut(): Promise<void>;
  refreshData(): Promise<void>;
  createReservation(input: {
    stationId: string;
    startsAt: string;
    endsAt: string;
    estimatedMinutes: number;
    projectName: string;
    workType: string;
    bufferMinutes?: number;
    instructions?: string | null;
  }): Promise<{ ok: boolean; message?: string; reservation?: ReservationSummary; accessCode?: string | null; instructions?: string | null }>;
  createStation(input: {
    organizationId: string;
    name: string;
    slug: string;
    stationCode: string;
    location?: string | null;
    instructions?: string;
    d5ExecutablePath?: string;
    rdpCommand?: string;
    rdpHost?: string;
    rdpWindowsUsername?: string;
    rdpWindowsPassword?: string;
    releaseChannelId?: string | null;
    stationSecret?: string;
  }): Promise<{ ok: boolean; message?: string; stationId?: string; pairingCode?: string; pairingExpiresAt?: string }>;
  updateStation(input: {
    id: string;
    releaseChannelId?: string | null;
    name?: string;
    slug?: string;
    stationCode?: string;
    location?: string | null;
    enabled?: boolean;
    instructions?: string;
    d5ExecutablePath?: string;
    rdpCommand?: string;
    rdpHost?: string;
    rdpWindowsUsername?: string;
    rdpWindowsPassword?: string;
    stationSecret?: string;
  }): Promise<{ ok: boolean; message?: string; stationId?: string; pairingCode?: string; pairingExpiresAt?: string }>;
  generateStationPairingCode(stationId: string): Promise<{ ok: boolean; code?: string; expiresAt?: string; message?: string }>;
  unpairStation(stationId: string): Promise<{ ok: boolean; message?: string }>;
  deleteStation(stationId: string): Promise<{ ok: boolean; message?: string }>;
  moveReservation(input: { id: string; startsAt: string; endsAt: string; estimatedMinutes: number }): Promise<{ ok: boolean; message?: string }>;
  cancelReservation(id: string): Promise<{ ok: boolean; message?: string }>;
  createAdminAccessCode(input: { stationId: string; validFrom: string; validUntil: string; maxUses?: number }): Promise<{ ok: boolean; code?: string; message?: string }>;
  revokeAccessCode(id: string): Promise<{ ok: boolean; message?: string }>;
  revokeSession(id: string): Promise<{ ok: boolean; message?: string }>;
  extendSession(id: string, extraMinutes: number): Promise<{ ok: boolean; message?: string }>;
  updateRole(id: string, role: Role): Promise<{ ok: boolean; message?: string }>;
  assignReleaseChannel(stationId: string, releaseChannelId: string | null): Promise<{ ok: boolean; message?: string }>;
  createOrganization(input: { name: string; slug: string; emailDomain: string | null; accessPolicy: AccessPolicy; rules?: Array<{ email: string; allowed: boolean }> }): Promise<{ ok: boolean; message?: string }>;
}

const AppContext = createContext<AppContextValue | null>(null);
const queryClient = new QueryClient();

WebBrowser.maybeCompleteAuthSession();

export function AppProvider(props: PropsWithChildren) {
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfileSummary | null>(null);
  const [memberships, setMemberships] = useState<MembershipSummary[]>([]);
  const [reservations, setReservations] = useState<ReservationSummary[]>([]);
  const [stationsState, setStationsState] = useState<StationSummary[]>([]);
  const [stationCatalog, setStationCatalog] = useState<StationRuntimeSnapshot[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [accessCodes, setAccessCodes] = useState<AccessCodeSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogSummary[]>([]);
  const [releaseChannels, setReleaseChannels] = useState<Array<{ id: string; name: string; description: string | null }>>([]);
  const [releaseVersions, setReleaseVersions] = useState<Array<{ id: string; channelId: string; version: string; notes: string | null }>>([]);

  async function loadData() {
    if (!supabase) {
      setLoading(false);
      setSignedIn(false);
      return;
    }

    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      setSignedIn(false);
      setProfile(null);
      setMemberships([]);
      setReservations([]);
      setStationCatalog([]);
      setSessions([]);
      setAccessCodes([]);
      setAuditLogs([]);
      setReleaseChannels([]);
      setReleaseVersions([]);
      setLoading(false);
      // fetch public station list in background, no spinner
      fetchStations(supabase).then((r) => setStationsState((r.data ?? []).map(mapStation)));
      return;
    }

    setSignedIn(true);

    // Fetch critical (profile + memberships) before unblocking navigation —
    // otherwise index.tsx would wrongly redirect to onboarding while memberships
    // are still loading.
    const [profileResponse, membershipsResponse] = await Promise.all([
      fetchCurrentProfile(supabase),
      fetchMemberships(supabase),
    ]);

    setProfile(profileResponse.data
      ? mapProfile(profileResponse.data)
      : {
          id: user.id,
          email: user.email ?? null,
          displayName: user.user_metadata?.full_name ?? null
        });
    setMemberships((membershipsResponse.data ?? []).map(mapMembership));

    // Ready to route — heavy queries load in background below
    setLoading(false);

    const [
      reservationsResponse,
      stationCatalogResponse,
      allReservationsResponse,
      sessionsResponse,
      accessCodesResponse,
      auditLogsResponse,
      releaseChannelsResponse,
      releaseVersionsResponse
    ] = await Promise.all([
      fetchReservationsForUser(supabase, user.id),
      fetchStationCatalog(supabase),
      fetchAllReservations(supabase),
      fetchAllSessions(supabase),
      fetchAccessCodes(supabase),
      fetchAuditLogs(supabase),
      fetchReleaseChannels(supabase),
      fetchDesktopAppVersions(supabase)
    ]);
    const mappedAccessCodes = (accessCodesResponse.data ?? []).map(mapAccessCode);
    const decorateReservation = (reservation: ReservationSummary) => ({
      ...reservation,
      accessCode:
        mappedAccessCodes.find((code) => code.reservationId === reservation.id)?.displayCode ?? reservation.accessCode
    });
    setReservations((reservationsResponse.data ?? []).map(mapReservation).map(decorateReservation));

    const catalog = mapStationCatalog(stationCatalogResponse.data);
    setStationCatalog(catalog);
    setStationsState(catalog.map((item) => ({
      ...(item.station as StationSummary),
      nextReservationStartsAt: item.nextReservation?.startsAt ?? null,
      nextReservationEndsAt: item.nextReservation?.endsAt ?? null,
      activeSessionId: item.activeSession?.id ?? null
    })));
    setSessions((sessionsResponse.data ?? []).map((row) => ({
      id: row.id,
      stationId: row.station_id,
      organizationId: row.organization_id,
      userId: row.user_id,
      reservationId: row.reservation_id,
      accessCodeId: row.access_code_id,
      startsAt: row.started_at,
      estimatedEndAt: row.estimated_end_at,
      actualEndAt: row.actual_end_at,
      state: row.state,
      adminOverride: row.admin_override,
      revokedAt: row.revoked_at,
      terminationReason: row.termination_reason,
      warningLevel: "normal",
      nextReservationId: null
    })));
    setAccessCodes(mappedAccessCodes);
    setAuditLogs((auditLogsResponse.data ?? []).map(mapAuditLog));
    setReleaseChannels((releaseChannelsResponse.data ?? []).map((row) => ({ id: row.id, name: row.name, description: row.description })));
    setReleaseVersions((releaseVersionsResponse.data ?? []).map((row) => ({
      id: row.id,
      channelId: row.channel_id,
      version: row.version,
      notes: row.notes
    })));

    if ((allReservationsResponse.data ?? []).length > (reservationsResponse.data ?? []).length) {
      setReservations((allReservationsResponse.data ?? []).map(mapReservation).map(decorateReservation));
    }
  }

  useEffect(() => {
    void loadData();
    if (!supabase) {
      return;
    }

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void loadData();
    });

    // Refetch stations every 20s so the admin monitor view picks up fresh
    // last_seen_at values from station heartbeats without a manual reload.
    const refreshTimer = setInterval(() => {
      if (!supabase) return;
      void fetchStations(supabase).then((r) => {
        if (r.data) setStationsState(r.data.map(mapStation));
      });
    }, 20000);

    return () => {
      listener.subscription.unsubscribe();
      clearInterval(refreshTimer);
    };
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      signedIn,
      loading,
      roles: memberships.length > 0 ? memberships.map((item) => item.role) : ["user"],
      memberships,
      reservations,
      stations: stationsState,
      stationCatalog,
      sessions,
      accessCodes,
      auditLogs,
      profile,
      releaseChannels,
      releaseVersions,
      async signIn() {
        if (!supabase) {
          return { ok: false, message: "Supabase client is not configured." };
        }

        const redirectTo = "renderizador://sign-in";
        const signInResponse = await supabase.auth.signInWithOAuth({
          provider: "azure",
          options: {
            redirectTo,
            skipBrowserRedirect: true,
            scopes: "email profile"
          }
        });

        if (signInResponse.error || !signInResponse.data.url) {
          return { ok: false, message: signInResponse.error?.message ?? "No OAuth URL returned." };
        }

        const browserResult = await WebBrowser.openAuthSessionAsync(signInResponse.data.url, redirectTo);
        if (browserResult.type !== "success" || !browserResult.url) {
          return { ok: false, message: browserResult.type === "cancel" ? "Sign-in cancelled." : "Browser session failed." };
        }

        const parsed = Linking.parse(browserResult.url);
        const code = typeof parsed.queryParams?.code === "string" ? parsed.queryParams.code : null;

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) return { ok: false, message: error.message };
          return { ok: true };
        }

        // Implicit flow fallback: tokens in hash fragment
        const hashStr = browserResult.url.includes("#") ? browserResult.url.split("#")[1] : "";
        const hashParams = new URLSearchParams(hashStr);
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) return { ok: false, message: error.message };
          return { ok: true };
        }

        return { ok: false, message: `Unexpected callback URL: ${browserResult.url}` };
      },
      async signOut() {
        if (!supabase) {
          return;
        }

        await supabase.auth.signOut();
        await loadData();
      },
      async refreshData() {
        await loadData();
      },
      async createReservation(input) {
        if (!supabase) {
          return { ok: false, message: "Supabase client is not configured." };
        }

        const response = await createReservationWithCode(supabase, input);
        if (response.error || !response.data) {
          return { ok: false, message: response.error?.message ?? "Failed to create reservation." };
        }

        const payload = response.data as Record<string, unknown>;
        if (!payload.ok) {
          return { ok: false, message: String(payload.message ?? "Reservation conflict detected.") };
        }

        await loadData();
        return {
          ok: true,
          reservation: payload.reservation ? mapReservation(payload.reservation as Parameters<typeof mapReservation>[0]) : undefined,
          accessCode: typeof (payload.access_code as Record<string, unknown> | undefined)?.plain_code === "string"
            ? String((payload.access_code as Record<string, unknown>).plain_code)
            : null,
          instructions: typeof payload.instructions === "string" ? payload.instructions : null
        };
      },
      async createStation(input) {
        if (!supabase) {
          return { ok: false, message: "Supabase client is not configured." };
        }

        const response = await createStationQuery(supabase, input);
        if (response.error || !response.data) {
          return { ok: false, message: response.error?.message ?? "Failed to create station." };
        }

        const stationId = response.data.id;
        const pairing = await generateStationPairingCodeQuery(supabase, { stationId });
        await loadData();
        if (pairing.error || !pairing.data) {
          return { ok: true, stationId, message: pairing.error?.message ?? "Station created but pairing code could not be generated." };
        }
        return { ok: true, stationId, pairingCode: pairing.data.plain_code, pairingExpiresAt: pairing.data.expires_at };
      },
      async unpairStation(stationId) {
        if (!supabase) return { ok: false, message: "Supabase client is not configured." };
        const response = await unpairStationQuery(supabase, stationId);
        if (response.error || !response.data?.ok) {
          return { ok: false, message: response.error?.message ?? "Unable to unpair." };
        }
        await loadData();
        return { ok: true };
      },
      async deleteStation(stationId) {
        if (!supabase) return { ok: false, message: "Supabase client is not configured." };
        const response = (await deleteStationQuery(supabase, stationId)) as {
          data: { ok?: boolean } | null;
          error: { message?: string } | null;
        };
        if (response.error || !response.data?.ok) {
          return { ok: false, message: response.error?.message ?? "Unable to delete station." };
        }
        await loadData();
        return { ok: true };
      },
      async generateStationPairingCode(stationId) {
        if (!supabase) return { ok: false, message: "Supabase client is not configured." };
        const response = await generateStationPairingCodeQuery(supabase, { stationId });
        if (response.error || !response.data) {
          return { ok: false, message: response.error?.message ?? "Unable to generate code." };
        }
        return { ok: true, code: response.data.plain_code, expiresAt: response.data.expires_at };
      },
      async updateStation(input) {
        if (!supabase) {
          return { ok: false, message: "Supabase client is not configured." };
        }

        const response = await updateStationQuery(supabase, input);
        if (response.error) {
          return { ok: false, message: response.error.message };
        }

        await loadData();
        return { ok: true };
      },
      async moveReservation(input) {
        if (!supabase) {
          return { ok: false, message: "Supabase client is not configured." };
        }

        const response = await moveReservationQuery(supabase, input);
        if (response.error) {
          return { ok: false, message: response.error.message };
        }

        await loadData();
        return { ok: true };
      },
      async cancelReservation(id) {
        if (!supabase) {
          return { ok: false, message: "Supabase client is not configured." };
        }

        const response = await cancelReservationQuery(supabase, id);
        if (response.error) {
          return { ok: false, message: response.error.message };
        }

        await loadData();
        return { ok: true };
      },
      async createAdminAccessCode(input) {
        if (!supabase) {
          return { ok: false, message: "Supabase client is not configured." };
        }

        const response = await createAdminAccessCodeQuery(supabase, input);
        if (response.error || !response.data) {
          return { ok: false, message: response.error?.message ?? "Unable to create access code." };
        }

        await loadData();
        return { ok: true, code: typeof (response.data as Record<string, unknown>).plain_code === "string" ? String((response.data as Record<string, unknown>).plain_code) : undefined };
      },
      async revokeAccessCode(id) {
        if (!supabase) {
          return { ok: false, message: "Supabase client is not configured." };
        }

        const response = await revokeAccessCodeQuery(supabase, id);
        if (response.error) {
          return { ok: false, message: response.error.message };
        }

        await loadData();
        return { ok: true };
      },
      async revokeSession(id) {
        if (!supabase) {
          return { ok: false, message: "Supabase client is not configured." };
        }

        const response = await revokeStationSession(supabase, id);
        if (response.error) {
          return { ok: false, message: response.error.message };
        }

        await loadData();
        return { ok: true };
      },
      async extendSession(id, extraMinutes) {
        if (!supabase) {
          return { ok: false, message: "Supabase client is not configured." };
        }

        const response = await extendStationSession(supabase, id, extraMinutes);
        if (response.error || !response.data) {
          return { ok: false, message: response.error?.message ?? "Unable to extend session." };
        }

        const payload = response.data as Record<string, unknown>;
        if (!payload.ok) {
          return { ok: false, message: String(payload.message ?? "Unable to extend session.") };
        }

        await loadData();
        return { ok: true };
      },
      async updateRole(id, role) {
        if (!supabase) {
          return { ok: false, message: "Supabase client is not configured." };
        }

        const response = await updateMembershipRole(supabase, id, role);
        if (response.error) {
          return { ok: false, message: response.error.message };
        }

        await loadData();
        return { ok: true };
      },
      async createOrganization(input) {
        if (!supabase) return { ok: false, message: "Supabase no configurado." };
        const resp = await createOrganizationQuery(supabase, input);
        if (resp.error) return { ok: false, message: resp.error.message };
        await loadData();
        return { ok: true };
      },
      async assignReleaseChannel(stationId, releaseChannelId) {
        if (!supabase) {
          return { ok: false, message: "Supabase client is not configured." };
        }

        const response = await assignStationReleaseChannelQuery(supabase, stationId, releaseChannelId);
        if (response.error) {
          return { ok: false, message: response.error.message };
        }

        await loadData();
        return { ok: true };
      }
    }),
    [accessCodes, auditLogs, loading, memberships, profile, releaseChannels, releaseVersions, reservations, sessions, signedIn, stationCatalog, stationsState]
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppContext.Provider value={value}>{props.children}</AppContext.Provider>
    </QueryClientProvider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("AppProvider is missing");
  }

  return context;
}

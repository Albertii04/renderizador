import { create } from "zustand";
import type {
  AccessCodeSummary,
  AccessDecision,
  MembershipSummary,
  ReservationSummary,
  SessionSummary,
  StationConfig,
  StationRuntimeSnapshot,
  UpdateStatus,
  UserProfileSummary
} from "@renderizador/types";

type AppScreen = "boot" | "auth" | "locked" | "launcher" | "admin" | "settings" | "station-unregistered" | "mode-select" | "gatekeeper" | "client-launcher" | "pairing";

interface AppState {
  screen: AppScreen;
  stationConfig: StationConfig | null;
  reservation: ReservationSummary | null;
  nextReservation: ReservationSummary | null;
  accessCode: AccessCodeSummary | null;
  membership: MembershipSummary | null;
  session: SessionSummary | null;
  profile: UserProfileSummary | null;
  accessDecision: AccessDecision | null;
  stationState: StationRuntimeSnapshot["stationState"];
  failedAttempts: number;
  updateStatus: UpdateStatus;
  lastActionMessage: string | null;
  busy: boolean;
  setScreen(screen: AppScreen): void;
  setStationConfig(config: StationConfig): void;
  setReservation(reservation: ReservationSummary | null): void;
  setNextReservation(reservation: ReservationSummary | null): void;
  setAccessCode(code: AccessCodeSummary | null): void;
  setMembership(membership: MembershipSummary | null): void;
  setSession(session: SessionSummary | null): void;
  setProfile(profile: UserProfileSummary | null): void;
  setAccessDecision(decision: AccessDecision | null): void;
  setStationState(state: StationRuntimeSnapshot["stationState"]): void;
  setFailedAttempts(value: number): void;
  setUpdateStatus(status: UpdateStatus): void;
  setLastActionMessage(message: string | null): void;
  setBusy(value: boolean): void;
}

export const useAppStore = create<AppState>((set) => ({
  screen: "boot",
  stationConfig: null,
  reservation: null,
  nextReservation: null,
  accessCode: null,
  membership: null,
  session: null,
  profile: null,
  accessDecision: null,
  stationState: "locked",
  failedAttempts: 0,
  updateStatus: { status: "idle" },
  lastActionMessage: null,
  busy: false,
  setScreen: (screen) => set({ screen }),
  setStationConfig: (stationConfig) => set({ stationConfig }),
  setReservation: (reservation) => set({ reservation }),
  setNextReservation: (nextReservation) => set({ nextReservation }),
  setAccessCode: (accessCode) => set({ accessCode }),
  setMembership: (membership) => set({ membership }),
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setAccessDecision: (accessDecision) => set({ accessDecision }),
  setStationState: (stationState) => set({ stationState }),
  setFailedAttempts: (failedAttempts) => set({ failedAttempts }),
  setUpdateStatus: (updateStatus) => set({ updateStatus }),
  setLastActionMessage: (lastActionMessage) => set({ lastActionMessage }),
  setBusy: (busy) => set({ busy })
}));

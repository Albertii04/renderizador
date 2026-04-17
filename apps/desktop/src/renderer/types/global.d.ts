import type { StationConfig, StationConfigInput, UpdateStatus } from "@renderizador/types";

declare global {
  interface Window {
    workstation: {
      launchD5(): Promise<{ ok: boolean; message?: string }>;
      launchRemoteDesktop(): Promise<{ ok: boolean; message?: string }>;
      getStationConfig(): Promise<StationConfig>;
      saveStationConfig(input: StationConfigInput): Promise<StationConfig>;
      startMicrosoftAuth(input: { authUrl: string; redirectTo: string }): Promise<{ ok: boolean; callbackUrl?: string; message?: string }>;
      connectRdp(input: { host: string; username: string; password: string }): Promise<{ ok: boolean; message?: string }>;
      checkForUpdates(): Promise<UpdateStatus>;
      restartToUpdate(): Promise<void>;
      openExternalDocs(target: string): Promise<{ ok: boolean }>;
      onUpdateStatus(callback: (payload: UpdateStatus) => void): () => void;
    };
  }
}

export {};

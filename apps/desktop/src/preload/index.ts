import { contextBridge, ipcRenderer } from "electron";
import type { StationConfig, StationConfigInput, UpdateStatus } from "@renderizador/types";

const workstation = {
  launchD5: () => ipcRenderer.invoke("launch:d5") as Promise<{ ok: boolean; message?: string }>,
  launchRemoteDesktop: () => ipcRenderer.invoke("launch:rdp") as Promise<{ ok: boolean; message?: string }>,
  getStationConfig: () => ipcRenderer.invoke("station-config:get") as Promise<StationConfig>,
  saveStationConfig: (input: StationConfigInput) =>
    ipcRenderer.invoke("station-config:save", input) as Promise<StationConfig>,
  startMicrosoftAuth: (input: { authUrl: string; redirectTo: string }) =>
    ipcRenderer.invoke("auth:microsoft", input) as Promise<{ ok: boolean; callbackUrl?: string; message?: string }>,
  connectRdp: (input: { host: string; username: string; password: string }) =>
    ipcRenderer.invoke("rdp:connect", input) as Promise<{ ok: boolean; message?: string }>,
  checkForUpdates: () => ipcRenderer.invoke("updates:check") as Promise<UpdateStatus>,
  restartToUpdate: () => ipcRenderer.invoke("updates:restart") as Promise<void>,
  installUpdate: () => ipcRenderer.invoke("updates:install") as Promise<void>,
  openExternalDocs: (target: string) => ipcRenderer.invoke("docs:open", target) as Promise<{ ok: boolean }>,
  onUpdateStatus: (callback: (payload: UpdateStatus) => void) => {
    const listener = (_event: unknown, payload: UpdateStatus) => callback(payload);
    ipcRenderer.on("updater:status", listener);
    return () => ipcRenderer.removeListener("updater:status", listener);
  }
};

contextBridge.exposeInMainWorld("workstation", workstation);

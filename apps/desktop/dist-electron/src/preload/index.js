import { contextBridge, ipcRenderer } from "electron";
const workstation = {
    launchD5: () => ipcRenderer.invoke("launch:d5"),
    launchRemoteDesktop: () => ipcRenderer.invoke("launch:rdp"),
    getStationConfig: () => ipcRenderer.invoke("station-config:get"),
    saveStationConfig: (input) => ipcRenderer.invoke("station-config:save", input),
    startMicrosoftAuth: (input) => ipcRenderer.invoke("auth:microsoft", input),
    connectRdp: (input) => ipcRenderer.invoke("rdp:connect", input),
    checkForUpdates: () => ipcRenderer.invoke("updates:check"),
    restartToUpdate: () => ipcRenderer.invoke("updates:restart"),
    openExternalDocs: (target) => ipcRenderer.invoke("docs:open", target),
    onUpdateStatus: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on("updater:status", listener);
        return () => ipcRenderer.removeListener("updater:status", listener);
    }
};
contextBridge.exposeInMainWorld("workstation", workstation);

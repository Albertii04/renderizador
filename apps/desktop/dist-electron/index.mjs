"use strict";
const electron = require("electron");
const workstation = {
  launchD5: () => electron.ipcRenderer.invoke("launch:d5"),
  launchRemoteDesktop: () => electron.ipcRenderer.invoke("launch:rdp"),
  getStationConfig: () => electron.ipcRenderer.invoke("station-config:get"),
  saveStationConfig: (input) => electron.ipcRenderer.invoke("station-config:save", input),
  startMicrosoftAuth: (input) => electron.ipcRenderer.invoke("auth:microsoft", input),
  connectRdp: (input) => electron.ipcRenderer.invoke("rdp:connect", input),
  checkForUpdates: () => electron.ipcRenderer.invoke("updates:check"),
  restartToUpdate: () => electron.ipcRenderer.invoke("updates:restart"),
  installUpdate: () => electron.ipcRenderer.invoke("updates:install"),
  openExternalDocs: (target) => electron.ipcRenderer.invoke("docs:open", target),
  onUpdateStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    electron.ipcRenderer.on("updater:status", listener);
    return () => electron.ipcRenderer.removeListener("updater:status", listener);
  }
};
electron.contextBridge.exposeInMainWorld("workstation", workstation);

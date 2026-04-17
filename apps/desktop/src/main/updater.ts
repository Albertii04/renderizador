import electronUpdater from "electron-updater";
import log from "electron-log";
import { app, type BrowserWindow } from "electron";
import type { UpdateStatus } from "@renderizador/types";

const { autoUpdater } = electronUpdater;

autoUpdater.logger = log;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

const HOUR_MS = 60 * 60 * 1000;
let pollHandle: ReturnType<typeof setInterval> | null = null;

export function wireUpdater(
  mainWindow: BrowserWindow,
  onStatus?: (status: UpdateStatus) => void
) {
  const emit = (status: UpdateStatus) => {
    mainWindow.webContents.send("updater:status", status);
    onStatus?.(status);
  };
  autoUpdater.on("checking-for-update", () => emit({ status: "checking" }));
  autoUpdater.on("update-available", (info) => emit({ status: "available", version: info.version }));
  autoUpdater.on("update-not-available", () => emit({ status: "not_available" }));
  autoUpdater.on("download-progress", (progress) =>
    emit({ status: "downloading", percent: progress.percent })
  );
  autoUpdater.on("update-downloaded", (info) => emit({ status: "downloaded", version: info.version }));
  autoUpdater.on("error", (error) => emit({ status: "error", message: error.message }));
}

export function startAutoUpdateLoop() {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    log.warn("initial update check failed", error);
  });
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = setInterval(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      log.warn("hourly update check failed", error);
    });
  }, HOUR_MS);
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      status: result?.updateInfo.version ? "available" : "not_available",
      version: result?.updateInfo.version
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unknown update error"
    };
  }
}

export async function quitAndInstall() {
  autoUpdater.quitAndInstall();
}

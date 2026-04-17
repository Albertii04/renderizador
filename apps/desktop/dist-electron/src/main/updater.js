import electronUpdater from "electron-updater";
import log from "electron-log";
const { autoUpdater } = electronUpdater;
autoUpdater.logger = log;
autoUpdater.autoDownload = false;
export function wireUpdater(mainWindow) {
    autoUpdater.on("checking-for-update", () => {
        mainWindow.webContents.send("updater:status", { status: "checking" });
    });
    autoUpdater.on("update-available", (info) => {
        mainWindow.webContents.send("updater:status", { status: "available", version: info.version });
    });
    autoUpdater.on("update-not-available", () => {
        mainWindow.webContents.send("updater:status", { status: "not_available" });
    });
    autoUpdater.on("update-downloaded", (info) => {
        mainWindow.webContents.send("updater:status", { status: "downloaded", version: info.version });
    });
    autoUpdater.on("error", (error) => {
        mainWindow.webContents.send("updater:status", { status: "error", message: error.message });
    });
}
export async function checkForUpdates() {
    try {
        const result = await autoUpdater.checkForUpdates();
        return {
            status: result?.updateInfo.version ? "available" : "not_available",
            version: result?.updateInfo.version
        };
    }
    catch (error) {
        return {
            status: "error",
            message: error instanceof Error ? error.message : "Unknown update error"
        };
    }
}

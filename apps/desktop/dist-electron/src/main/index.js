import { app, BrowserWindow, ipcMain, shell } from "electron";
import { access, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkForUpdates, wireUpdater } from "./updater.js";
import { readStationConfig, writeStationConfig } from "./store.js";
let mainWindow = null;
const currentDir = dirname(fileURLToPath(import.meta.url));
const hasSingleInstanceLock = app.requestSingleInstanceLock();
async function launchConfiguredBinary(binaryPath, args = []) {
    const trimmedPath = binaryPath.trim();
    if (!trimmedPath) {
        return { ok: false, message: "The launcher is not configured for this station." };
    }
    try {
        const candidatePath = isAbsolute(trimmedPath) ? trimmedPath : resolve(trimmedPath);
        await access(candidatePath);
        const child = spawn(candidatePath, args, {
            detached: true,
            stdio: "ignore",
            shell: false
        });
        child.unref();
        return { ok: true, message: `Launched ${candidatePath}.` };
    }
    catch (error) {
        return {
            ok: false,
            message: error instanceof Error ? error.message : "Unable to launch configured executable."
        };
    }
}
async function connectRdpInternal(input) {
    if (!input.host) {
        return { ok: false, message: "Server address is not configured." };
    }
    if (process.platform === "darwin") {
        const rdpLines = [
            `full address:s:${input.host}`,
            `username:s:${input.username}`,
            `prompt for credentials:i:0`,
            `authentication level:i:2`,
            `redirectclipboard:i:1`
        ].join("\r\n");
        const rdpPath = join(app.getPath("temp"), "renderizador-session.rdp");
        await writeFile(rdpPath, rdpLines, "utf8");
        if (input.password) {
            spawn("security", [
                "add-internet-password",
                "-a", input.username,
                "-s", input.host,
                "-w", input.password,
                "-U"
            ], { detached: true, stdio: "ignore" }).unref();
        }
        spawn("open", ["-a", "Windows App", rdpPath], { detached: true, stdio: "ignore" }).unref();
        return { ok: true };
    }
    if (input.password) {
        spawn("cmdkey", [
            `/generic:TERMSRV/${input.host}`,
            `/user:${input.username}`,
            `/pass:${input.password}`
        ], { detached: true, stdio: "ignore", shell: false }).unref();
    }
    spawn("mstsc", [`/v:${input.host}`], { detached: true, stdio: "ignore", shell: false }).unref();
    return { ok: true };
}
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 960,
        backgroundColor: "#020617",
        webPreferences: {
            preload: join(currentDir, "../../index.mjs"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    wireUpdater(mainWindow);
    mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
        console.error(`[did-fail-load] ${errorCode} ${errorDescription} ${validatedUrl}`);
    });
    mainWindow.webContents.on("render-process-gone", (_event, details) => {
        console.error("[render-process-gone]", details);
    });
    if (process.env.VITE_DEV_SERVER_URL) {
        void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    }
    else {
        void mainWindow.loadFile(join(currentDir, "../../dist/index.html"));
    }
}
async function startMicrosoftAuth(authUrl, redirectTo) {
    if (!mainWindow) {
        return { ok: false, message: "Main window is not available." };
    }
    const authWindow = new BrowserWindow({
        width: 520,
        height: 760,
        title: "Microsoft sign-in",
        parent: mainWindow,
        modal: true,
        autoHideMenuBar: true,
        backgroundColor: "#050816",
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });
    return await new Promise((resolve) => {
        let settled = false;
        const finish = (payload) => {
            if (settled) {
                return;
            }
            settled = true;
            authWindow.removeAllListeners();
            authWindow.webContents.removeAllListeners("will-redirect");
            authWindow.webContents.removeAllListeners("will-navigate");
            if (!authWindow.isDestroyed()) {
                authWindow.close();
            }
            resolve(payload);
        };
        const handleRedirect = (url) => {
            if (!url.startsWith(redirectTo)) {
                return false;
            }
            finish({ ok: true, callbackUrl: url });
            return true;
        };
        authWindow.webContents.on("will-redirect", (event, url) => {
            if (handleRedirect(url)) {
                event.preventDefault();
            }
        });
        authWindow.webContents.on("will-navigate", (event, url) => {
            if (handleRedirect(url)) {
                event.preventDefault();
            }
        });
        authWindow.webContents.setWindowOpenHandler(({ url }) => {
            void shell.openExternal(url);
            return { action: "deny" };
        });
        authWindow.on("closed", () => {
            finish({ ok: false, message: "Microsoft sign-in was cancelled." });
        });
        void authWindow.loadURL(authUrl).catch((error) => {
            finish({
                ok: false,
                message: error instanceof Error ? error.message : "Unable to open Microsoft sign-in."
            });
        });
    });
}
if (!hasSingleInstanceLock) {
    app.quit();
}
else {
    app.on("second-instance", () => {
        if (!mainWindow) {
            return;
        }
        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }
        mainWindow.focus();
    });
    app.whenReady().then(() => {
        ipcMain.handle("launch:d5", async () => {
            const config = await readStationConfig();
            return launchConfiguredBinary(config.d5ExecutablePath);
        });
        ipcMain.handle("launch:rdp", async () => {
            const config = await readStationConfig();
            if (config.rdpHost) {
                return connectRdpInternal({
                    host: config.rdpHost,
                    username: config.rdpWindowsUsername,
                    password: config.rdpWindowsPassword
                });
            }
            return {
                ok: false,
                message: "Remote desktop is not configured. Add a host in station settings."
            };
        });
        ipcMain.handle("station-config:get", async () => readStationConfig());
        ipcMain.handle("station-config:save", async (_event, input) => writeStationConfig(input));
        ipcMain.handle("auth:microsoft", async (_event, input) => startMicrosoftAuth(input.authUrl, input.redirectTo));
        ipcMain.handle("rdp:connect", async (_event, input) => connectRdpInternal(input));
        ipcMain.handle("updates:check", async () => checkForUpdates());
        ipcMain.handle("updates:restart", async () => app.relaunch());
        ipcMain.handle("docs:open", async (_event, target) => {
            if (!/^https:\/\//.test(target)) {
                return { ok: false };
            }
            await shell.openExternal(target);
            return { ok: true };
        });
        createWindow();
        app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });
}
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

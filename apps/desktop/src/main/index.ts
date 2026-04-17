import { app, BrowserWindow, ipcMain, shell } from "electron";
import { access, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkForUpdates, quitAndInstall, startAutoUpdateLoop, wireUpdater } from "./updater.js";
import { readStationConfig, writeStationConfig } from "./store.js";
import {
  canQuit,
  createTray,
  hideToTray,
  lockKiosk,
  setAllowQuit,
  showFromTray,
  unlockKiosk,
  wireKioskGuards
} from "./kiosk.js";
import { startWatchdog } from "./watchdog.js";
import { installOsKeepAlive } from "./keepalive.js";

let mainWindow: BrowserWindow | null = null;
const currentDir = dirname(fileURLToPath(import.meta.url));
const hasSingleInstanceLock = app.requestSingleInstanceLock();

async function launchConfiguredBinary(binaryPath: string, args: string[] = []) {
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
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to launch configured executable."
    };
  }
}

async function connectRdpInternal(input: { host: string; username: string; password: string }) {
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
  startAutoUpdateLoop();
  wireKioskGuards(mainWindow);
  createTray(mainWindow);
  void startWatchdog();
  void installOsKeepAlive();
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(`[did-fail-load] ${errorCode} ${errorDescription} ${validatedUrl}`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[render-process-gone]", details);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(join(app.getAppPath(), "dist/index.html"));
  }

}

async function startMicrosoftAuth(authUrl: string, redirectTo: string) {
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

  return await new Promise<{ ok: boolean; callbackUrl?: string; message?: string }>((resolve) => {
    let settled = false;

    const finish = (payload: { ok: boolean; callbackUrl?: string; message?: string }) => {
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

    const handleRedirect = (url: string) => {
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

    void authWindow.loadURL(authUrl).catch((error: unknown) => {
      finish({
        ok: false,
        message: error instanceof Error ? error.message : "Unable to open Microsoft sign-in."
      });
    });
  });
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    showFromTray(mainWindow);
  });

  app.on("before-quit", (event) => {
    if (!canQuit()) {
      event.preventDefault();
      if (mainWindow && !mainWindow.isDestroyed()) {
        hideToTray(mainWindow);
      }
    }
  });

  app.whenReady().then(() => {
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false });
    }
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
  ipcMain.handle("auth:microsoft", async (_event, input: { authUrl: string; redirectTo: string }) =>
    startMicrosoftAuth(input.authUrl, input.redirectTo)
  );
  ipcMain.handle("rdp:connect", async (_event, input: { host: string; username: string; password: string }) =>
    connectRdpInternal(input)
  );
  ipcMain.handle("updates:check", async () => checkForUpdates());
  ipcMain.handle("updates:restart", async () => app.relaunch());
  ipcMain.handle("updates:install", async () => quitAndInstall());
  ipcMain.handle("docs:open", async (_event, target: string) => {
    if (!/^https:\/\//.test(target)) {
      return { ok: false };
    }
    await shell.openExternal(target);
    return { ok: true };
  });

  ipcMain.handle("kiosk:lock", async () => {
    lockKiosk(mainWindow);
    return { ok: true };
  });
  ipcMain.handle("kiosk:unlock", async () => {
    unlockKiosk(mainWindow);
    return { ok: true };
  });
  ipcMain.handle("window:hide", async () => {
    hideToTray(mainWindow);
    return { ok: true };
  });
  ipcMain.handle("window:show", async () => {
    showFromTray(mainWindow);
    return { ok: true };
  });
  ipcMain.handle("app:allow-quit", async (_event, value: boolean) => {
    setAllowQuit(Boolean(value));
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
  // Never auto-quit: kiosk mode keeps the process alive in the tray until an
  // explicit "Salir" from the tray menu flips `allowQuit`.
  if (!canQuit()) return;
  if (process.platform !== "darwin") {
    app.quit();
  }
});

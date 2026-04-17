import { app, BrowserWindow, Menu, nativeImage, Tray } from "electron";

// 16x16 transparent PNG with a filled circle. Placeholder icons until real assets ship.
const ICON_IDLE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAW0lEQVR4nO3QMQ6AIBBE0a8XsvT+h7KwE+xoEMGExMSCTf5rXjMFgPnSvh3rfXq6o7iIVwISoRBEKQpBlIIoRSGIUhSCKEUhiFIUgihFIYhSFIIoRSGIUhTWL7QOLuPW7UJ8AAAAAElFTkSuQmCC";
const ICON_ACTIVE_DATA_URL = ICON_IDLE_DATA_URL;

let tray: Tray | null = null;
let kioskLocked = false;
let allowQuit = false;

export function isKioskLocked(): boolean {
  return kioskLocked;
}

export function canQuit(): boolean {
  return allowQuit;
}

export function setAllowQuit(value: boolean): void {
  allowQuit = value;
}

export function lockKiosk(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return;
  kioskLocked = true;

  if (!win.isVisible()) win.show();
  if (process.platform === "darwin") {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    app.dock?.show()?.catch(() => undefined);
  }
  win.setMinimizable(false);
  win.setClosable(false);
  win.setFullScreen(true);
  win.setKiosk(true);
  win.setAlwaysOnTop(true, "screen-saver");
  win.focus();
  updateTrayState("idle");
}

export function unlockKiosk(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return;
  kioskLocked = false;
  win.setKiosk(false);
  win.setAlwaysOnTop(false);
  win.setFullScreen(false);
  win.setClosable(true);
  win.setMinimizable(true);
  updateTrayState("active");
}

export function hideToTray(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return;
  if (process.platform === "darwin") {
    app.dock?.hide();
  }
  win.hide();
  updateTrayState("active");
}

export function showFromTray(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return;
  if (process.platform === "darwin") {
    app.dock?.show()?.catch(() => undefined);
  }
  win.show();
  win.focus();
}

export function wireKioskGuards(win: BrowserWindow): void {
  win.on("close", (event) => {
    if (!canQuit()) {
      event.preventDefault();
      if (kioskLocked) {
        win.show();
        win.focus();
      } else {
        hideToTray(win);
      }
    }
  });

  win.on("blur", () => {
    if (!kioskLocked) return;
    setImmediate(() => {
      if (!win.isDestroyed() && kioskLocked) win.focus();
    });
  });

  win.on("minimize", () => {
    if (kioskLocked) {
      win.restore();
      win.focus();
    }
  });

  win.webContents.on("before-input-event", (event, input) => {
    if (!kioskLocked) return;
    const key = input.key.toLowerCase();
    const blocked =
      (input.alt && key === "tab") ||
      (input.alt && key === "f4") ||
      (input.meta && (key === "q" || key === "w" || key === "h" || key === "m")) ||
      (input.control && input.shift && key === "i") ||
      key === "f11" ||
      key === "f12" ||
      key === "escape";
    if (blocked) event.preventDefault();
  });
}

export function createTray(win: BrowserWindow): Tray | null {
  if (tray) return tray;
  const image = nativeImage.createFromDataURL(ICON_IDLE_DATA_URL);
  if (process.platform === "darwin") image.setTemplateImage(true);
  try {
    tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  } catch (error) {
    console.error("[tray] create failed", error);
    return null;
  }
  tray.setToolTip("Renderizador");
  if (process.platform === "darwin" && image.isEmpty()) tray.setTitle("●");
  tray.on("click", () => showFromTray(win));
  tray.on("double-click", () => showFromTray(win));
  rebuildTrayMenu(win);
  return tray;
}

function rebuildTrayMenu(win: BrowserWindow): void {
  if (!tray) return;
  // No "Salir" option on purpose: the station process must stay alive.
  // Quit is only possible from the Settings page (gated by the station admin).
  tray.setContextMenu(
    Menu.buildFromTemplate([{ label: "Mostrar estación", click: () => showFromTray(win) }])
  );
}

function updateTrayState(state: "idle" | "active"): void {
  if (!tray) return;
  const url = state === "idle" ? ICON_IDLE_DATA_URL : ICON_ACTIVE_DATA_URL;
  const image = nativeImage.createFromDataURL(url);
  if (process.platform === "darwin") image.setTemplateImage(true);
  if (!image.isEmpty()) tray.setImage(image);
  tray.setToolTip(state === "idle" ? "Renderizador · estación libre" : "Renderizador · sesión en curso");
}

import { app } from "electron";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const RUNNER_SOURCE = `
const { spawn } = require("child_process");
const [, , pidStr, appExec] = process.argv;
const pid = Number(pidStr);
if (!pid || !appExec) process.exit(1);

const timer = setInterval(() => {
  try {
    process.kill(pid, 0);
  } catch {
    clearInterval(timer);
    try {
      const env = Object.assign({}, process.env);
      delete env.ELECTRON_RUN_AS_NODE;
      spawn(appExec, [], { detached: true, stdio: "ignore", env }).unref();
    } catch (error) {
      // swallow — OS-level keepalive will recover
    }
    process.exit(0);
  }
}, 2000);
`;

// Starts a detached sidecar that relaunches the app if the main process dies.
// Runs only in packaged builds; dev mode skips to avoid respawn loops.
export async function startWatchdog(): Promise<void> {
  if (!app.isPackaged) return;

  try {
    const runnerPath = join(app.getPath("temp"), "renderizador-watchdog.cjs");
    await writeFile(runnerPath, RUNNER_SOURCE, "utf8");

    const child = spawn(process.execPath, [runnerPath, String(process.pid), process.execPath], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
    });
    child.unref();
  } catch (error) {
    console.error("[watchdog] start failed", error);
  }
}

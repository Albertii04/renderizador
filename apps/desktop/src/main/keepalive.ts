import { app } from "electron";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const AGENT_LABEL = "com.renderizador.station.keepalive";
const WIN_TASK_NAME = "RenderizadorStationKeepAlive";

// Registers an OS-level relauncher so that Task Manager / Force Quit / reboots
// cannot leave the station permanently dead. Relies on the app's single-
// instance lock to dedupe when a kept-alive invocation overlaps an existing
// process. Packaged builds only — dev mode skips.
export async function installOsKeepAlive(): Promise<void> {
  if (!app.isPackaged) return;

  try {
    if (process.platform === "darwin") {
      await installLaunchAgent();
    } else if (process.platform === "win32") {
      await installScheduledTask();
    }
  } catch (error) {
    console.error("[keepalive] install failed", error);
  }
}

async function installLaunchAgent(): Promise<void> {
  const exec = process.execPath;
  const agentsDir = join(homedir(), "Library", "LaunchAgents");
  const plistPath = join(agentsDir, `${AGENT_LABEL}.plist`);

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${exec}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Interactive</string>
</dict>
</plist>
`;

  await mkdir(agentsDir, { recursive: true });
  await writeFile(plistPath, plist, "utf8");

  // Bootstrap into the current GUI session. If already loaded this is a no-op.
  const uid = process.getuid?.() ?? 0;
  const domain = `gui/${uid}`;
  spawn("launchctl", ["bootstrap", domain, plistPath], { stdio: "ignore" })
    .on("error", () => undefined);
  spawn("launchctl", ["enable", `${domain}/${AGENT_LABEL}`], { stdio: "ignore" })
    .on("error", () => undefined);
}

async function installScheduledTask(): Promise<void> {
  const exec = process.execPath;
  const logPath = join(app.getPath("userData"), "keepalive-install.log");

  const runSchtasks = (args: string[]) =>
    new Promise<{ code: number | null; stdout: string; stderr: string }>((resolveRun) => {
      const child = spawn("schtasks", args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      child.on("error", (error) => resolveRun({ code: -1, stdout, stderr: stderr + String(error) }));
      child.on("close", (code) => resolveRun({ code, stdout, stderr }));
    });

  // The app's single-instance lock dedupes overlapping launches, so running
  // schtasks every minute is safe: if the station is already up the new
  // invocation just refocuses and exits, and if it's dead a new instance
  // boots. No admin rights required.
  const minuteTask = await runSchtasks([
    "/Create",
    "/SC", "MINUTE",
    "/MO", "1",
    "/TN", WIN_TASK_NAME,
    "/TR", `"${exec}"`,
    "/F"
  ]);

  // Second task: on every logon, as a belt-and-suspenders guard for reboots
  // where the minute timer hasn't fired yet.
  const logonTask = await runSchtasks([
    "/Create",
    "/SC", "ONLOGON",
    "/TN", `${WIN_TASK_NAME}Logon`,
    "/TR", `"${exec}"`,
    "/F"
  ]);

  const summary =
    `[${new Date().toISOString()}] exec=${exec}\n` +
    `minute: exit=${minuteTask.code} stdout=${minuteTask.stdout.trim()} stderr=${minuteTask.stderr.trim()}\n` +
    `logon: exit=${logonTask.code} stdout=${logonTask.stdout.trim()} stderr=${logonTask.stderr.trim()}\n\n`;

  try {
    await writeFile(logPath, summary, { flag: "a" });
  } catch {
    // log write failures are not fatal
  }
}

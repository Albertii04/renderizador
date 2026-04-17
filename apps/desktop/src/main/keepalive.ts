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
  // Two triggers: at logon AND every 2 minutes. The app's single-instance lock
  // means an already-running station just refocuses and exits; if dead, a new
  // instance boots. No admin rights required.
  const xml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Keeps Renderizador Station running.</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
    <TimeTrigger>
      <Repetition>
        <Interval>PT2M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
      <StartBoundary>2020-01-01T00:00:00</StartBoundary>
      <Enabled>true</Enabled>
    </TimeTrigger>
  </Triggers>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>false</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Hidden>true</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <Enabled>true</Enabled>
  </Settings>
  <Actions>
    <Exec>
      <Command>${escapeXml(exec)}</Command>
    </Exec>
  </Actions>
</Task>
`;

  const xmlPath = join(app.getPath("temp"), "renderizador-keepalive.xml");
  await writeFile(xmlPath, "\ufeff" + xml, "utf16le");

  spawn("schtasks", ["/Create", "/TN", WIN_TASK_NAME, "/XML", xmlPath, "/F"], {
    stdio: "ignore",
    windowsHide: true
  }).on("error", () => undefined);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

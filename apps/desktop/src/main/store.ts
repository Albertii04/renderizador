import { app, safeStorage } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { StationConfig, StationConfigInput } from "@renderizador/types";

const defaultConfig: StationConfig = {
  stationId: "",
  stationCode: "",
  stationName: "",
  organizationId: "",
  releaseChannel: "stable",
  instructions: "",
  d5ExecutablePath: "",
  rdpCommand: "",
  stationSecret: "",
  mode: "",
  rdpHost: "",
  rdpWindowsUsername: "",
  rdpWindowsPassword: "",
  freeAccess: false
};

type PublicStationConfig = Omit<StationConfig, "stationSecret" | "rdpWindowsPassword">;
type SecureStationConfig = Pick<StationConfig, "stationSecret" | "rdpWindowsPassword">;

const defaultPublicConfig: PublicStationConfig = {
  stationId: "",
  stationCode: "",
  stationName: "",
  organizationId: "",
  releaseChannel: "stable",
  instructions: "",
  d5ExecutablePath: "",
  rdpCommand: "",
  mode: "",
  rdpHost: "",
  rdpWindowsUsername: "",
  freeAccess: false
};

const defaultSecureConfig: SecureStationConfig = {
  stationSecret: "",
  rdpWindowsPassword: ""
};

function getConfigPath() {
  return join(app.getPath("userData"), "station-config.json");
}

function getSecureConfigPath() {
  return join(app.getPath("userData"), "station-secrets.json");
}

function encryptSecret(value: string) {
  if (!value) {
    return "";
  }

  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString("base64");
  }

  return value;
}

function decryptSecret(value: string) {
  if (!value) {
    return "";
  }

  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(value, "base64"));
    } catch {
      return "";
    }
  }

  return value;
}

async function readPublicConfig(): Promise<PublicStationConfig> {
  try {
    const content = await readFile(getConfigPath(), "utf8");
    const parsed = JSON.parse(content) as Partial<StationConfig>;
    return {
      ...defaultPublicConfig,
      ...parsed,
    };
  } catch {
    return defaultPublicConfig;
  }
}

async function readSecureConfig(): Promise<SecureStationConfig> {
  try {
    const content = await readFile(getSecureConfigPath(), "utf8");
    const parsed = JSON.parse(content) as Partial<Record<keyof SecureStationConfig, string>>;
    return {
      stationSecret: decryptSecret(parsed.stationSecret ?? ""),
      rdpWindowsPassword: decryptSecret(parsed.rdpWindowsPassword ?? "")
    };
  } catch {
    return defaultSecureConfig;
  }
}

export async function readStationConfig(): Promise<StationConfig> {
  const [publicConfig, secureConfig] = await Promise.all([readPublicConfig(), readSecureConfig()]);
  return { ...defaultConfig, ...publicConfig, ...secureConfig };
}

export async function writeStationConfig(input: StationConfigInput): Promise<StationConfig> {
  const nextConfig = { ...(await readStationConfig()), ...input };
  const publicConfig: PublicStationConfig = {
    stationId: nextConfig.stationId,
    stationCode: nextConfig.stationCode,
    stationName: nextConfig.stationName,
    organizationId: nextConfig.organizationId,
    releaseChannel: nextConfig.releaseChannel,
    instructions: nextConfig.instructions,
    d5ExecutablePath: nextConfig.d5ExecutablePath,
    rdpCommand: nextConfig.rdpCommand,
    mode: nextConfig.mode,
    rdpHost: nextConfig.rdpHost,
    rdpWindowsUsername: nextConfig.rdpWindowsUsername,
    freeAccess: nextConfig.freeAccess,
  };
  const secureConfig = {
    stationSecret: encryptSecret(nextConfig.stationSecret),
    rdpWindowsPassword: encryptSecret(nextConfig.rdpWindowsPassword),
  };

  const filePath = getConfigPath();
  const secureFilePath = getSecureConfigPath();
  await mkdir(dirname(filePath), { recursive: true });
  await Promise.all([
    writeFile(filePath, JSON.stringify(publicConfig, null, 2), "utf8"),
    writeFile(secureFilePath, JSON.stringify(secureConfig, null, 2), "utf8")
  ]);
  return nextConfig;
}

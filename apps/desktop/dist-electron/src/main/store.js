import { app, safeStorage } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
const defaultConfig = {
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
    rdpWindowsPassword: ""
};
const defaultPublicConfig = {
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
    rdpWindowsUsername: ""
};
const defaultSecureConfig = {
    stationSecret: "",
    rdpWindowsPassword: ""
};
function getConfigPath() {
    return join(app.getPath("userData"), "station-config.json");
}
function getSecureConfigPath() {
    return join(app.getPath("userData"), "station-secrets.json");
}
function encryptSecret(value) {
    if (!value) {
        return "";
    }
    if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.encryptString(value).toString("base64");
    }
    return value;
}
function decryptSecret(value) {
    if (!value) {
        return "";
    }
    if (safeStorage.isEncryptionAvailable()) {
        try {
            return safeStorage.decryptString(Buffer.from(value, "base64"));
        }
        catch {
            return "";
        }
    }
    return value;
}
async function readPublicConfig() {
    try {
        const content = await readFile(getConfigPath(), "utf8");
        const parsed = JSON.parse(content);
        return {
            ...defaultPublicConfig,
            ...parsed,
        };
    }
    catch {
        return defaultPublicConfig;
    }
}
async function readSecureConfig() {
    try {
        const content = await readFile(getSecureConfigPath(), "utf8");
        const parsed = JSON.parse(content);
        return {
            stationSecret: decryptSecret(parsed.stationSecret ?? ""),
            rdpWindowsPassword: decryptSecret(parsed.rdpWindowsPassword ?? "")
        };
    }
    catch {
        return defaultSecureConfig;
    }
}
export async function readStationConfig() {
    const [publicConfig, secureConfig] = await Promise.all([readPublicConfig(), readSecureConfig()]);
    return { ...defaultConfig, ...publicConfig, ...secureConfig };
}
export async function writeStationConfig(input) {
    const nextConfig = { ...(await readStationConfig()), ...input };
    const publicConfig = {
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

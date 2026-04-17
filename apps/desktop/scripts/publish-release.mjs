#!/usr/bin/env node
// Uploads the freshly built desktop artifacts in apps/desktop/release/ to the
// `desktop-releases` Supabase Storage bucket. Wipes the bucket first so only
// the newest release remains — electron-updater reads latest.yml from the same
// public URL configured in electron-builder.json.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const BUCKET = "desktop-releases";
const releaseDir = fileURLToPath(new URL("../release/", import.meta.url));

const ARTIFACT_RE = /\.(exe|dmg|zip|appimage|blockmap|yml|yaml)$/i;

const contentTypeFor = (name) => {
  const ext = extname(name).toLowerCase();
  if (ext === ".yml" || ext === ".yaml") return "text/yaml";
  if (ext === ".exe") return "application/vnd.microsoft.portable-executable";
  if (ext === ".dmg") return "application/x-apple-diskimage";
  if (ext === ".zip") return "application/zip";
  if (ext === ".appimage") return "application/x-appimage";
  return "application/octet-stream";
};

function listReleaseFiles() {
  let entries;
  try {
    entries = readdirSync(releaseDir);
  } catch (error) {
    console.error(`release directory missing: ${releaseDir}`);
    throw error;
  }
  return entries.filter((name) => {
    const full = join(releaseDir, name);
    return statSync(full).isFile() && ARTIFACT_RE.test(name);
  });
}

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  const files = listReleaseFiles();
  if (files.length === 0) {
    console.error("No release artifacts found. Run pnpm pack:win or pnpm pack:mac first.");
    process.exit(1);
  }

  console.log(`Wiping bucket ${BUCKET}...`);
  const { data: existing, error: listError } = await sb.storage.from(BUCKET).list("", {
    limit: 1000
  });
  if (listError) throw listError;
  if (existing && existing.length > 0) {
    const names = existing.map((entry) => entry.name);
    const { error: removeError } = await sb.storage.from(BUCKET).remove(names);
    if (removeError) throw removeError;
    console.log(`  removed ${names.length} old file(s)`);
  }

  for (const name of files) {
    const full = join(releaseDir, name);
    const body = readFileSync(full);
    const { error } = await sb.storage.from(BUCKET).upload(name, body, {
      upsert: true,
      contentType: contentTypeFor(name)
    });
    if (error) throw error;
    console.log(`  uploaded ${name} (${body.byteLength} bytes)`);
  }

  console.log(`Done. ${files.length} artifact(s) published to ${BUCKET}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

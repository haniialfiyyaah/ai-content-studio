#!/usr/bin/env node
/**
 * Lightweight smoke: upload a minimal valid MP4 to Supabase `renders`
 * via service role — verifies storage path used by browser-render complete.
 * Does NOT run Remotion WebCodecs (requires a real Chrome tab).
 * Does not print secrets.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const ROOT = new URL("..", import.meta.url).pathname;
const requireFromWeb = createRequire(join(ROOT, "apps/web/package.json"));
const { createClient } = requireFromWeb("@supabase/supabase-js");

function loadEnvLocal() {
  const raw = readFileSync(join(ROOT, "apps/web/.env.local"), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    env[t.slice(0, i)] = t.slice(i + 1).replace(/^"|"$/g, "");
  }
  return env;
}

/** Minimal ISO-BMFF with ftyp+free+mdat — enough for our ftyp gate. */
function minimalMp4() {
  // ftyp isom
  const ftyp = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00,
    0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
  ]);
  const free = Buffer.from([
    0x00, 0x00, 0x00, 0x08, 0x66, 0x72, 0x65, 0x65,
  ]);
  const mdatHeader = Buffer.from([
    0x00, 0x00, 0x00, 0x08, 0x6d, 0x64, 0x61, 0x74,
  ]);
  return Buffer.concat([ftyp, free, mdatHeader]);
}

async function main() {
  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ownerId = process.env.ACS_SMOKE_OWNER_ID ?? "00000000-0000-4000-8000-000000000001";
  const projectId =
    process.env.ACS_SMOKE_PROJECT_ID ?? "00000000-0000-4000-8000-000000000002";
  const fileName = `smoke-browser-${Date.now()}.mp4`;
  const storagePath = `${ownerId}/${projectId}/${fileName}`;
  const bytes = minimalMp4();
  const checksum = createHash("sha256").update(bytes).digest("hex");

  const { error: uploadError } = await admin.storage
    .from("renders")
    .upload(storagePath, bytes, { contentType: "video/mp4", upsert: true });

  if (uploadError) {
    console.error("UPLOAD_FAIL", uploadError.message);
    process.exit(1);
  }

  const { data: signed, error: signedError } = await admin.storage
    .from("renders")
    .createSignedUrl(storagePath, 120);

  if (signedError || !signed?.signedUrl) {
    console.error("SIGNED_URL_FAIL", signedError?.message);
    process.exit(1);
  }

  // Cleanup smoke object
  await admin.storage.from("renders").remove([storagePath]);

  console.log(
    JSON.stringify({
      ok: true,
      bucket: "renders",
      storagePath,
      bytes: bytes.byteLength,
      checksum: checksum.slice(0, 16),
      signedUrlVerified: true,
      remotionWebCodecs: "manual_browser_required",
      note: "Storage upload path verified. Run Content → Production in Chrome for real MP4 encode.",
    }),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

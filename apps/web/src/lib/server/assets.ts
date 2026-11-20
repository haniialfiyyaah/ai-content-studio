import "server-only";
import { AppError, ErrorCodes, IMAGE_ENGINES, VISUAL_MODES, notFound, type ImageEngine, type VisualMode } from "@acs/domain";
import { createAdminClient } from "@/lib/supabase/admin";

const admin = () => createAdminClient();
export const ASSET_BUCKET = "assets";
const MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PER_PROJECT = 20;

export interface AssetView {
  id: string;
  label: string;
  url: string | null;
  storage_path: string;
  created_at: string;
}

async function ownedProject(ownerId: string, projectId: string) {
  const { data } = await admin().from("projects").select("id").eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  if (!data) throw notFound("Project");
}

/** Signed upload URL so the browser uploads straight to Storage (no size limits on our API). */
export async function createAssetUpload(ownerId: string, projectId: string, input: { fileName: string; mimeType: string; size: number }) {
  await ownedProject(ownerId, projectId);
  if (!MIME.has(input.mimeType)) throw new AppError(ErrorCodes.VALIDATION_ERROR, "Use JPG, PNG or WebP images", 400);
  if (input.size > MAX_BYTES) throw new AppError(ErrorCodes.VALIDATION_ERROR, "Images must be 10 MB or smaller", 400);
  const { count } = await admin().from("project_assets").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  if ((count ?? 0) >= MAX_PER_PROJECT) throw new AppError(ErrorCodes.VALIDATION_ERROR, `Up to ${MAX_PER_PROJECT} references per project`, 400);

  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[input.mimeType];
  const path = `${ownerId}/${projectId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin().storage.from(ASSET_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new AppError(ErrorCodes.INTERNAL_ERROR, "Could not prepare upload", 500);
  return { path, token: data.token };
}

export async function registerAsset(
  ownerId: string,
  projectId: string,
  input: { path: string; label?: string; mimeType: string; size: number },
) {
  await ownedProject(ownerId, projectId);
  if (!input.path.startsWith(`${ownerId}/${projectId}/`)) throw new AppError(ErrorCodes.FORBIDDEN, "Invalid asset path", 403);
  const { data, error } = await admin()
    .from("project_assets")
    .insert({
      owner_id: ownerId,
      project_id: projectId,
      storage_path: input.path,
      label: (input.label ?? "").trim().slice(0, 120),
      mime_type: input.mimeType,
      size_bytes: input.size,
    })
    .select("id")
    .single();
  if (error || !data) throw new AppError(ErrorCodes.INTERNAL_ERROR, "Could not save reference", 500);
  // First upload switches an AI-only project to reference-guided generation.
  await admin().from("projects").update({ visual_mode: "ai_with_references" }).eq("id", projectId).eq("visual_mode", "ai");
  return { id: data.id as string };
}

export async function deleteAsset(ownerId: string, assetId: string) {
  const db = admin();
  const { data } = await db.from("project_assets").select("id, storage_path, project_id").eq("id", assetId).eq("owner_id", ownerId).maybeSingle();
  if (!data) throw notFound("Reference");
  await db.storage.from(ASSET_BUCKET).remove([data.storage_path]);
  await db.from("project_assets").delete().eq("id", assetId);
  const { count } = await db.from("project_assets").select("id", { count: "exact", head: true }).eq("project_id", data.project_id);
  if (!count) await db.from("projects").update({ visual_mode: "ai" }).eq("id", data.project_id);
  return { ok: true };
}

export async function setVisualMode(ownerId: string, projectId: string, mode: VisualMode) {
  await ownedProject(ownerId, projectId);
  if (!VISUAL_MODES.includes(mode)) throw new AppError(ErrorCodes.VALIDATION_ERROR, "Unknown visual mode", 400);
  if (mode !== "ai") {
    const { count } = await admin().from("project_assets").select("id", { count: "exact", head: true }).eq("project_id", projectId);
    if (!count) throw new AppError(ErrorCodes.VALIDATION_ERROR, "Upload at least one reference image first", 400);
  }
  await admin().from("projects").update({ visual_mode: mode }).eq("id", projectId);
  return { visualMode: mode };
}

export async function setImageEngine(ownerId: string, projectId: string, engine: ImageEngine) {
  await ownedProject(ownerId, projectId);
  if (!IMAGE_ENGINES.includes(engine)) throw new AppError(ErrorCodes.VALIDATION_ERROR, "Unknown image engine", 400);
  await admin().from("projects").update({ image_engine: engine }).eq("id", projectId);
  return { imageEngine: engine };
}

/** Assets in upload order with signed URLs (index = referenceIndex used by scenes). */
export async function listAssets(projectId: string, seconds = 3600): Promise<AssetView[]> {
  const db = admin();
  const { data } = await db.from("project_assets").select("id, label, storage_path, created_at").eq("project_id", projectId).order("created_at");
  const rows = data ?? [];
  if (!rows.length) return [];
  const { data: signed } = await db.storage.from(ASSET_BUCKET).createSignedUrls(rows.map((r) => r.storage_path), seconds);
  return rows.map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? null }));
}

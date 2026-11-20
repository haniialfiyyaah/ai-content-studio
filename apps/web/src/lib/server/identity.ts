import "server-only";
import { AppError, ErrorCodes, notFound } from "@acs/domain";
import { generateOpenAiImage, openAiImagesConfigured } from "@acs/integrations";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "./events";
import type { ProjectRow } from "./rows";

/** Label marking the AI-generated identity reference in project_assets. */
export const IDENTITY_LABEL = "★ Main character (AI)";

/**
 * Generates the project's recurring subject (character / mascot / product) as
 * a clean reference image and stores it as a project reference, so every
 * scene image is generated from it (content-video skill §5).
 */
export async function generateIdentityReference(
  projectId: string,
  opts: { replace?: boolean; kit?: { recurringSubject?: string; visualStyle?: string; palette?: string } } = {},
) {
  const db = createAdminClient();
  const { data } = await db.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!data) throw notFound("Project");
  const p = data as ProjectRow & { visual_mode: string };
  const kit = { ...(p.creative_kit ?? {}), ...(opts.kit ?? {}) };
  const subject = (kit as { recurringSubject?: string }).recurringSubject?.trim();
  if (!subject) throw new AppError(ErrorCodes.VALIDATION_ERROR, "This project has no recurring character or subject in its Creative Kit", 400);
  if (!openAiImagesConfigured()) throw new AppError(ErrorCodes.NOT_CONFIGURED, "OPENAI_API_KEY is not configured", 503);

  const { data: existing } = await db.from("project_assets").select("id, storage_path").eq("project_id", p.id).eq("label", IDENTITY_LABEL);
  if (existing?.length && !opts.replace) return { skipped: true };

  const prompt = [
    `Character reference sheet of ${subject}.`,
    "Single full-body view, centered, friendly neutral pose facing slightly toward the camera, whole figure visible with margin around it.",
    "Plain soft light background, no props, no scenery.",
    `Art style: ${kit.visualStyle || "polished flat vector illustration, thick outlines, soft shading"}.`,
    (kit as { palette?: string }).palette ? `Color palette: ${(kit as { palette?: string }).palette}.` : "",
    "No text, no letters, no logos, no watermark.",
  ]
    .filter(Boolean)
    .join(" ");
  const img = await generateOpenAiImage(prompt);

  const path = `${p.owner_id}/${p.id}/identity-${crypto.randomUUID()}.png`;
  const { error } = await db.storage.from("assets").upload(path, img.bytes, { contentType: "image/png" });
  if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, `Could not store the character: ${error.message}`, 500);

  for (const old of existing ?? []) {
    await db.storage.from("assets").remove([old.storage_path]);
    await db.from("project_assets").delete().eq("id", old.id);
  }
  // Insert with an early timestamp so it stays reference #1 (index 0).
  await db.from("project_assets").insert({
    owner_id: p.owner_id,
    project_id: p.id,
    storage_path: path,
    label: IDENTITY_LABEL,
    mime_type: "image/png",
    size_bytes: img.bytes.byteLength,
    created_at: p.created_at,
  });
  if (p.visual_mode === "ai") await db.from("projects").update({ visual_mode: "ai_with_references" }).eq("id", p.id);
  await logActivity(db, { ownerId: p.owner_id, projectId: p.id, kind: "identity.generated", message: "Main character reference generated" });
  return { generated: true, model: img.model };
}

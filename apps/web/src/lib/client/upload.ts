"use client";

import { createClient } from "@/lib/supabase/client";
import { api } from "./api";

export const ACCEPT = "image/jpeg,image/png,image/webp";

/** Upload one reference image straight to Storage via a signed URL, then register it. */
export async function uploadReference(projectId: string, file: File, label?: string) {
  const { path, token } = await api<{ path: string; token: string }>(`/api/projects/${projectId}/assets/upload-url`, "POST", {
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  });
  const { error } = await createClient().storage.from("assets").uploadToSignedUrl(path, token, file, { contentType: file.type });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  await api(`/api/projects/${projectId}/assets`, "POST", {
    path,
    label: label ?? file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
    mimeType: file.type,
    size: file.size,
  });
}

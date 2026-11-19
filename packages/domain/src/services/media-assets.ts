import { AppError, ErrorCodes } from "@acs/schemas";

/** Minimal query + storage surface for media asset persistence. */
export interface MediaAssetDbClient {
  from: (table: string) => any;
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Buffer | ArrayBuffer | Blob,
        options?: {
          contentType?: string;
          upsert?: boolean;
        },
      ) => Promise<{ data: { path: string } | null; error: { message: string } | null }>;
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<{
        data: { signedUrl: string } | null;
        error: { message: string } | null;
      }>;
    };
  };
}

export interface PersistRenderAssetParams {
  ownerId: string;
  projectId: string;
  conceptId?: string | null;
  bytes: Buffer;
  mimeType?: string;
  fileName: string;
  width?: number;
  height?: number;
  durationMs?: number;
  provider?: string;
  modelId?: string | null;
  checksum?: string | null;
}

export interface PersistedMediaAsset {
  id: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Uploads an MP4 into the private `renders` bucket and inserts media_assets.
 * Path convention: `{ownerId}/{projectId}/{fileName}`.
 */
export async function persistRenderVideoAsset(
  supabase: MediaAssetDbClient,
  params: PersistRenderAssetParams,
): Promise<PersistedMediaAsset> {
  const bucket = "renders";
  const storagePath = `${params.ownerId}/${params.projectId}/${params.fileName}`;
  const mimeType = params.mimeType ?? "video/mp4";

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, params.bytes, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to upload render output to storage",
      500,
      { message: uploadError.message },
    );
  }

  const { data: row, error: insertError } = await supabase
    .from("media_assets")
    .insert({
      owner_id: params.ownerId,
      project_id: params.projectId,
      concept_id: params.conceptId ?? null,
      kind: "video",
      storage_bucket: bucket,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: params.bytes.byteLength,
      width: params.width ?? 1280,
      height: params.height ?? 720,
      duration_ms: params.durationMs ?? null,
      checksum: params.checksum ?? null,
      source_type: "generated",
      provider: params.provider ?? "remotion",
      model_id: params.modelId ?? "ShortFormVideo",
    })
    .select("id, storage_bucket, storage_path, mime_type, size_bytes")
    .single();

  if (insertError || !row) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to persist media_assets row",
      500,
      { message: insertError?.message },
    );
  }

  return {
    id: row.id as string,
    storageBucket: row.storage_bucket as string,
    storagePath: row.storage_path as string,
    mimeType: row.mime_type as string,
    sizeBytes: Number(row.size_bytes),
  };
}

/** Creates a short-lived signed URL for private render playback. */
export async function createRenderSignedUrl(
  supabase: MediaAssetDbClient,
  params: { storageBucket: string; storagePath: string; expiresIn?: number },
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(params.storageBucket)
    .createSignedUrl(params.storagePath, params.expiresIn ?? 3600);

  if (error || !data?.signedUrl) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to create signed URL for render",
      500,
      { message: error?.message },
    );
  }

  return data.signedUrl;
}

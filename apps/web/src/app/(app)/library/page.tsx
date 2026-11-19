import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/projects/status-pill";

interface MediaAssetRow {
  id: string;
  kind: string;
  source_type: string | null;
  mime_type: string | null;
  provider: string | null;
  size_bytes: number | null;
  project_id: string | null;
  concept_id: string | null;
  created_at: string;
  projects: { id: string; name: string } | null;
}

export default async function AssetLibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("media_assets")
    .select(
      `
      id,
      kind,
      source_type,
      mime_type,
      provider,
      size_bytes,
      project_id,
      concept_id,
      created_at,
      projects(id, name)
    `,
    )
    .eq("owner_id", user!.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  const assets = (data ?? []) as unknown as MediaAssetRow[];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section className="studio-panel p-6 md:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">
          Library
        </p>
        <h1 className="font-display mt-3 text-4xl tracking-tight">
          Asset Library
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Source and generated media across Projects — uploads, renders, and
          derived assets.
        </p>
      </section>

      <section className="studio-panel p-6 md:p-8">
        {assets.length === 0 ? (
          <div className="py-10 text-center">
            <h2 className="font-display text-2xl tracking-tight">
              No assets yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              Uploads and generated media will catalog here as production runs.
            </p>
            <Link
              href="/production"
              className="mt-6 inline-block text-sm font-medium text-accent hover:underline"
            >
              Open Production
            </Link>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((asset) => (
              <li
                key={asset.id}
                className="rounded-xl border border-border bg-surface-strong p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium capitalize">{asset.kind}</p>
                  <StatusPill
                    status={asset.source_type ?? "other"}
                    className="capitalize"
                  />
                </div>
                <p className="mt-2 text-xs text-muted">
                  {asset.mime_type ?? "unknown type"}
                  {asset.provider ? ` · ${asset.provider}` : ""}
                  {asset.size_bytes != null
                    ? ` · ${formatBytes(asset.size_bytes)}`
                    : ""}
                </p>
                {asset.projects && (
                  <p className="mt-2 text-sm text-muted">
                    <Link
                      href={`/projects/${asset.projects.id}`}
                      className="text-accent hover:underline"
                    >
                      {asset.projects.name}
                    </Link>
                  </p>
                )}
                {asset.concept_id && (
                  <p className="mt-1 text-sm">
                    <Link
                      href={`/content/${asset.concept_id}`}
                      className="text-accent hover:underline"
                    >
                      View concept
                    </Link>
                  </p>
                )}
                <time
                  className="mt-3 block text-xs text-muted"
                  dateTime={asset.created_at}
                >
                  {formatDate(asset.created_at)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

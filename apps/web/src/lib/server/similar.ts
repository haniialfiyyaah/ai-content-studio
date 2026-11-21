import "server-only";
import { cosine, embedTexts, openAiImagesConfigured } from "@acs/integrations";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Duplicate detection (docs/FLOW.md). Scores from text-embedding-3-small,
 * calibrated on real projects: same idea ≈ 0.6–0.8, related-but-different
 * ≈ 0.4–0.5, unrelated ≤ 0.3. Cross-language matches score lower, so the band
 * between the two thresholds is left to the agent to judge.
 */
export const SIMILAR_STRONG = 0.55;
export const SIMILAR_CANDIDATE = 0.35;

export interface SimilarProject {
  id: string;
  title: string;
  status: string;
  score: number;
}

/** The creator's other projects most similar to `text`, best first (score ≥ candidate threshold). */
export async function findSimilarProjects(ownerId: string, excludeId: string, text: string, limit = 3): Promise<SimilarProject[]> {
  if (!openAiImagesConfigured() || !text.trim()) return [];
  const { data } = await createAdminClient()
    .from("projects")
    .select("id, title, summary, prompt, concept, status")
    .eq("owner_id", ownerId)
    .neq("id", excludeId)
    .neq("status", "stopped")
    .order("created_at", { ascending: false })
    .limit(40);
  const projects = data ?? [];
  if (!projects.length) return [];
  const docs = projects.map((p) => {
    const niche = (p.concept as { niche?: string } | null)?.niche ?? "";
    return [p.title, niche, p.summary, p.prompt].filter(Boolean).join(". ");
  });
  try {
    const [q, ...v] = await embedTexts([text, ...docs]);
    return projects
      .map((p, i) => ({ id: p.id as string, title: p.title as string, status: p.status as string, score: Math.round(cosine(q, v[i]) * 100) / 100 }))
      .filter((p) => p.score >= SIMILAR_CANDIDATE)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch {
    return []; // never block a new project on the check
  }
}

/** Content-level thresholds (same project, so the niche is shared): rephrased same video ≈ 0.85, new idea in the niche ≤ 0.62, distinct contents ≤ 0.5. */
export const CONTENT_DUPLICATE = 0.7;
export const CONTENT_CLOSE = 0.55;

export interface SimilarContent {
  /** #number as the creator sees it (non-rejected content in position order). */
  number: number;
  id: string;
  title: string;
  hook: string;
  score: number;
}

const pickField = (options: Record<string, string[]> | null, selection: Record<string, number> | null, f: string) =>
  options?.[f]?.[selection?.[f] ?? 0] ?? "";

/** This project's contents most similar to `text` (score ≥ close threshold), best first. */
export async function findSimilarContents(projectId: string, text: string, opts: { excludeIds?: string[]; limit?: number } = {}): Promise<SimilarContent[]> {
  if (!openAiImagesConfigured() || !text.trim()) return [];
  const { data } = await createAdminClient()
    .from("contents")
    .select("id, options, selection")
    .eq("project_id", projectId)
    .neq("status", "archived")
    .order("position");
  const all = (data ?? []).map((c, i) => ({
    number: i + 1,
    id: c.id as string,
    title: pickField(c.options, c.selection, "title"),
    hook: pickField(c.options, c.selection, "hook"),
  }));
  const rows = all.filter((c) => !opts.excludeIds?.includes(c.id));
  if (!rows.length) return [];
  try {
    const [q, ...v] = await embedTexts([text, ...rows.map((r) => `${r.title}. ${r.hook}`)]);
    return rows
      .map((r, i) => ({ ...r, score: Math.round(cosine(q, v[i]) * 100) / 100 }))
      .filter((r) => r.score >= CONTENT_CLOSE)
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit ?? 3);
  } catch {
    return [];
  }
}

import { AppError, ErrorCodes } from "@acs/domain";

/** Cheap semantic similarity (duplicate projects / ideas). text-embedding-3-small ≈ $0.02 per 1M tokens. */
export const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new AppError(ErrorCodes.NOT_CONFIGURED, "OPENAI_API_KEY is not configured", 503);
  if (!texts.length) return [];
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: OPENAI_EMBEDDING_MODEL, input: texts.map((t) => t.slice(0, 2000) || " ") }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new AppError(ErrorCodes.PROVIDER_ERROR, `Embeddings failed (${res.status})`, 502);
  const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

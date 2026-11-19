/**
 * Deterministic fal.ai fixture used when ACS_FAL_FIXTURE_MODE=true
 * or when no fal credentials are configured.
 */
export interface FalRenderRequest {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  seed?: number;
}

export interface FalRenderFixtureResult {
  provider: "fal";
  fixture: true;
  providerRequestId: string;
  status: "completed";
  outputUrl: string;
  model: string;
  estimatedCost: number;
}

export function fixtureFalRender(
  request: FalRenderRequest,
): FalRenderFixtureResult {
  const model = request.model ?? "fixture-fal-video";
  const seed = request.seed ?? hashSeed(request.prompt);
  const providerRequestId = `fal-fixture-${seed.toString(16)}`;

  return {
    provider: "fal",
    fixture: true,
    providerRequestId,
    status: "completed",
    outputUrl: `https://fixtures.acs.local/fal/${providerRequestId}.mp4`,
    model,
    estimatedCost: 0,
  };
}

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

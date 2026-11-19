import {
  AppError,
  ErrorCodes,
  type AiExecuteRequest,
  type OpenAiMode,
} from "@acs/schemas";
import { fixtureAiCompletion } from "./fixture";

export interface ExecuteOpenAiOptions {
  fixtureMode: boolean;
  managedApiKey?: string | null;
  byokApiKey?: string | null;
  mode: OpenAiMode;
}

export interface ExecuteOpenAiSuccess {
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  fixture: boolean;
  mode: OpenAiMode;
}

/**
 * Executes an OpenAI completion using the caller's resolved mode.
 * WHY: BYOK must never use the managed studio key — billing leakage risk.
 */
export async function executeOpenAi(
  request: AiExecuteRequest,
  options: ExecuteOpenAiOptions,
): Promise<ExecuteOpenAiSuccess> {
  const { mode, fixtureMode } = options;

  if (mode === "byok") {
    const byokKey = options.byokApiKey?.trim() || null;

    // Live BYOK without a key fails hard — never fall back to managed.
    if (!byokKey && !fixtureMode) {
      throw new AppError(
        ErrorCodes.BYOK_KEY_INVALID,
        "Bring-your-own OpenAI key is required for BYOK mode",
        400,
        { errorCode: ErrorCodes.BYOK_KEY_INVALID },
      );
    }

    if (fixtureMode || !byokKey) {
      const result = fixtureAiCompletion(request);
      return { ...result, mode };
    }

    return callOpenAi(request, byokKey, mode);
  }

  // Managed path — never reached when mode is byok.
  const managedKey = options.managedApiKey?.trim() || null;
  if (fixtureMode || !managedKey) {
    const result = fixtureAiCompletion(request);
    return { ...result, mode };
  }

  return callOpenAi(request, managedKey, mode);
}

async function callOpenAi(
  request: AiExecuteRequest,
  apiKey: string,
  mode: OpenAiMode,
): Promise<ExecuteOpenAiSuccess> {
  const model = request.model ?? "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: request.messages,
      ...(request.responseFormat === "json"
        ? { response_format: { type: "json_object" } }
        : {}),
    }),
  });

  if (!response.ok) {
    // Do not include response body — may echo prompt fragments.
    throw new AppError(
      response.status === 429
        ? ErrorCodes.AI_PROVIDER_RATE_LIMITED
        : ErrorCodes.PROVIDER_UNAVAILABLE,
      "OpenAI request failed",
      response.status >= 500 ? 502 : 400,
      { status: response.status, mode },
    );
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    model?: string;
  };

  const content = json.choices?.[0]?.message?.content ?? "";
  return {
    content,
    model: json.model ?? model,
    tokensIn: json.usage?.prompt_tokens ?? 0,
    tokensOut: json.usage?.completion_tokens ?? 0,
    fixture: false,
    mode,
  };
}

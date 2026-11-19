import type { AiExecuteRequest } from "@acs/schemas";

/**
 * Deterministic OpenAI fixture used when ACS_AI_FIXTURE_MODE=true
 * or when no provider key is configured.
 */
export function fixtureAiCompletion(request: AiExecuteRequest): {
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  fixture: true;
} {
  const lastUser = [...request.messages]
    .reverse()
    .find((m) => m.role === "user");
  const prompt = lastUser?.content ?? "";

  const content =
    request.responseFormat === "json"
      ? JSON.stringify({
          reply:
            "I've outlined a Draft Project based on your idea. Review the Creative Kit and concepts when ready.",
          proposedProject: {
            name: deriveTitle(prompt),
            objective: prompt.slice(0, 500),
          },
          concepts: [
            {
              title: `${deriveTitle(prompt)} — Launch Concept`,
              hook: "Open with the core promise in the first 3 seconds.",
              script: `Concept draft for: ${prompt.slice(0, 280)}`,
              selectedForInitialLaunch: true,
            },
          ],
        })
      : `Thanks — I'll treat this as a creative brief and prepare a Draft Project around "${deriveTitle(prompt)}". You can refine the Creative Kit and concepts next.`;

  return {
    content,
    model: request.model ?? "fixture-openai",
    tokensIn: Math.ceil(prompt.length / 4),
    tokensOut: Math.ceil(content.length / 4),
    fixture: true,
  };
}

function deriveTitle(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Untitled Project";
  const words = cleaned.split(" ").slice(0, 6).join(" ");
  return words.length > 60 ? `${words.slice(0, 57)}...` : words;
}

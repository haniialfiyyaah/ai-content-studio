import { z } from "zod";
import {
  AiProviderConnectionStatusSchema,
  OpenAiModeSchema,
} from "./enums";

/** Coerces Postgres timestamptz strings into ISO-8601 for zod datetime. */
const IsoDateTimeSchema = z.preprocess((value) => {
  if (value == null || value === "") return value;
  if (typeof value !== "string") return value;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const asDate = new Date(normalized);
  if (Number.isNaN(asDate.getTime())) return value;
  return asDate.toISOString();
}, z.string().datetime());

const NullableIsoDateTimeSchema = z.preprocess((value) => {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return value;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const asDate = new Date(normalized);
  if (Number.isNaN(asDate.getTime())) return value;
  return asDate.toISOString();
}, z.string().datetime().nullable());

export const AiProviderPreferencesSchema = z.object({
  ownerId: z.string().uuid(),
  openaiMode: OpenAiModeSchema,
  preferredModelId: z.string().nullable(),
  version: z.number().int().positive(),
  updatedAt: IsoDateTimeSchema,
});
export type AiProviderPreferences = z.infer<typeof AiProviderPreferencesSchema>;

export const AiProviderConnectionPublicSchema = z.object({
  id: z.string().uuid(),
  provider: z.literal("openai"),
  last4: z.string().length(4).nullable(),
  keyFingerprint: z.string().nullable(),
  status: AiProviderConnectionStatusSchema,
  verifiedAt: NullableIsoDateTimeSchema,
  lastErrorCode: z.string().nullable(),
  rotatedAt: NullableIsoDateTimeSchema,
});
export type AiProviderConnectionPublic = z.infer<
  typeof AiProviderConnectionPublicSchema
>;

export const SetAiModeSchema = z.object({
  mode: OpenAiModeSchema,
  expectedVersion: z.number().int().positive(),
});
export type SetAiMode = z.infer<typeof SetAiModeSchema>;

export const ConnectOpenAiKeySchema = z.object({
  apiKey: z.string().min(20).max(200),
});
export type ConnectOpenAiKey = z.infer<typeof ConnectOpenAiKeySchema>;

export const AiExecuteRequestSchema = z.object({
  ownerId: z.string().uuid(),
  purpose: z.enum([
    "agent_chat",
    "ideation",
    "research",
    "script",
    "storyboard",
    "insight",
  ]),
  model: z.string().optional(),
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    }),
  ),
  responseFormat: z.enum(["text", "json"]).default("text"),
  projectId: z.string().uuid().optional(),
  workflowRunId: z.string().uuid().optional(),
  correlationId: z.string().uuid().optional(),
});
export type AiExecuteRequest = z.infer<typeof AiExecuteRequestSchema>;

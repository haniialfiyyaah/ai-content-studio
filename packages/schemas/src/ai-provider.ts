import { z } from "zod";
import {
  AiProviderConnectionStatusSchema,
  OpenAiModeSchema,
} from "./enums";

export const AiProviderPreferencesSchema = z.object({
  ownerId: z.string().uuid(),
  openaiMode: OpenAiModeSchema,
  preferredModelId: z.string().nullable(),
  version: z.number().int().positive(),
  updatedAt: z.string().datetime(),
});
export type AiProviderPreferences = z.infer<typeof AiProviderPreferencesSchema>;

export const AiProviderConnectionPublicSchema = z.object({
  id: z.string().uuid(),
  provider: z.literal("openai"),
  last4: z.string().length(4).nullable(),
  keyFingerprint: z.string().nullable(),
  status: AiProviderConnectionStatusSchema,
  verifiedAt: z.string().datetime().nullable(),
  lastErrorCode: z.string().nullable(),
  rotatedAt: z.string().datetime().nullable(),
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

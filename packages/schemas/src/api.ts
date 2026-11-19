import { z } from "zod";

/** Standard action envelope returned by public and internal APIs. */
export const ActionEnvelopeSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["accepted", "ok", "error"]),
  data: z.unknown().nullable(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    })
    .nullable(),
  correlationId: z.string().uuid(),
});
export type ActionEnvelope<T = unknown> = {
  requestId: string;
  status: "accepted" | "ok" | "error";
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  correlationId: string;
};

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const SignupRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(120).optional(),
});
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const IdempotencyKeySchema = z.string().min(8).max(128);

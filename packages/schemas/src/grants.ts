import { z } from "zod";
import { AuthorizationScopeSchema } from "./enums";

export const AuthorizationGrantSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  actorId: z.string().uuid().nullable(),
  scope: AuthorizationScopeSchema,
  projectId: z.string().uuid().nullable(),
  destinationId: z.string().uuid().nullable(),
  limitAmount: z.number().nullable(),
  currency: z.string().nullable(),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  policyVersion: z.string().nullable(),
  metadata: z.unknown(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AuthorizationGrant = z.infer<typeof AuthorizationGrantSchema>;

/** Body for POST /api/projects/:id/grants */
export const CreateGrantInputSchema = z.object({
  scope: AuthorizationScopeSchema,
  limitAmount: z.number().nonnegative().optional(),
  currency: z.string().min(3).max(8).optional(),
  destinationId: z.string().uuid().optional(),
  validUntil: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type CreateGrantInput = z.infer<typeof CreateGrantInputSchema>;

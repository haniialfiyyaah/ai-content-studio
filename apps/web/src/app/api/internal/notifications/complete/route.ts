import { AppError, ErrorCodes } from "@acs/domain";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const CompleteNotificationSchema = z.object({
  notificationId: z.string().uuid(),
  state: z.enum(["delivered", "failed", "cancelled"]).default("delivered"),
  providerMessageId: z.string().max(200).optional(),
  correlationId: z.string().optional(),
});

/**
 * POST /api/internal/notifications/complete
 * Marks a notification delivery attempt finished (used by WF-06).
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = CompleteNotificationSchema.parse(await request.json());
    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const patch: {
      delivery_state: string;
      delivered_at?: string;
    } = {
      delivery_state: body.state,
    };
    if (body.state === "delivered") {
      patch.delivered_at = now;
    }

    const { data, error } = await supabase
      .from("notifications")
      .update(patch)
      .eq("id", body.notificationId)
      .select("id, delivery_state, delivered_at")
      .single();

    if (error || !data) {
      throw new AppError(
        ErrorCodes.NOT_FOUND,
        error?.message ?? "Notification not found",
        404,
      );
    }

    return jsonOk(
      {
        notificationId: data.id,
        state: data.delivery_state,
        deliveredAt: data.delivered_at,
        providerMessageId: body.providerMessageId ?? null,
      },
      body.correlationId ?? correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}

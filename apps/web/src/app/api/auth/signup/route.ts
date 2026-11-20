import { z } from "zod";
import { AppError, ErrorCodes } from "@acs/domain";
import { createClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";

const SignupRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Use at least 8 characters"),
  displayName: z.string().trim().max(80).optional(),
});

export async function POST(request: Request) {
  try {
    const body = SignupRequestSchema.parse(await request.json());
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        data: {
          display_name: body.displayName,
        },
      },
    });

    if (error) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, error.message, 400);
    }

    return jsonOk({
      user: data.user
        ? { id: data.user.id, email: data.user.email }
        : null,
      needsEmailConfirmation: !data.session,
    });
  } catch (error) {
    return jsonError(error);
  }
}

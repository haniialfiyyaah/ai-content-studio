import { z } from "zod";
import { AppError, ErrorCodes } from "@acs/domain";
import { createClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";

const LoginRequestSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const body = LoginRequestSchema.parse(await request.json());
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });

    if (error || !data.user) {
      throw new AppError(
        ErrorCodes.UNAUTHENTICATED,
        "Invalid email or password",
        401,
      );
    }

    return jsonOk({
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

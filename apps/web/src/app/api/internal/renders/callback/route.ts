import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError, ErrorCodes } from "@acs/domain";
import { handle } from "@/lib/api/response";
import { rendererCallback } from "@/lib/server/renders";

const Body = z.object({
  renderId: z.string().uuid(),
  ok: z.boolean(),
  error: z.string().optional(),
  durationSeconds: z.number().optional(),
});

function assertRenderer(req: Request) {
  const expected = Buffer.from(process.env.RENDERER_TOKEN ?? "");
  const given = Buffer.from(req.headers.get("x-renderer-token") ?? "");
  if (!expected.length || expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new AppError(ErrorCodes.UNAUTHENTICATED, "Invalid renderer token", 401);
  }
}

export async function POST(req: Request) {
  return handle(async () => {
    assertRenderer(req);
    return rendererCallback(Body.parse(await req.json()));
  });
}

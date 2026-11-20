import { z } from "zod";
import { handle } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { generationFail } from "@/lib/server/internal";

export async function POST(req: Request) {
  return handle(async () => {
    assertInternalServiceAuth(req);
    return generationFail(z.object({ runId: z.string().uuid(), error: z.string().default("Generation failed") }).parse(await req.json()));
  });
}

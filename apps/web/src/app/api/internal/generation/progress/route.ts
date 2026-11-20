import { z } from "zod";
import { handle } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { generationProgress } from "@/lib/server/internal";

export async function POST(req: Request) {
  return handle(async () => {
    assertInternalServiceAuth(req);
    return generationProgress(z.object({ runId: z.string().uuid(), stage: z.string(), progress: z.coerce.number() }).parse(await req.json()));
  });
}

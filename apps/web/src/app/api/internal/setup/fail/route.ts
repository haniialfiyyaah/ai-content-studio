import { z } from "zod";
import { handle } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { setupFail } from "@/lib/server/setup";

export async function POST(req: Request) {
  return handle(async () => {
    assertInternalServiceAuth(req);
    return setupFail(z.object({ projectId: z.string().uuid(), error: z.string().max(2000).optional() }).parse(await req.json()));
  });
}

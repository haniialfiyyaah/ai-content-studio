import { z } from "zod";
import { handle } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { generationIdentity } from "@/lib/server/internal";

export const maxDuration = 120;

const Body = z.object({
  runId: z.string().uuid(),
  recurringSubject: z.string().optional(),
  visualStyle: z.string().optional(),
  palette: z.string().optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    assertInternalServiceAuth(req);
    return generationIdentity(Body.parse(await req.json()));
  });
}

import { z } from "zod";
import { SETUP_TASKS } from "@acs/domain";
import { handle } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { setupContext } from "@/lib/server/setup";

/** WF-05: everything the setup agent needs for one task. */
export async function POST(req: Request) {
  return handle(async () => {
    assertInternalServiceAuth(req);
    const body = z
      .object({
        projectId: z.string().uuid(),
        task: z.enum(SETUP_TASKS),
        feedback: z.string().max(1500).optional(),
        target: z.object({ contentId: z.string().uuid(), scene: z.number().int().min(0) }).optional(),
        count: z.number().int().min(1).max(5).optional(),
      })
      .parse(await req.json());
    return setupContext(body);
  });
}

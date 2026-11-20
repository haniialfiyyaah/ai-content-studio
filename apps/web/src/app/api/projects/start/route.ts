import { z } from "zod";
import { handle } from "@/lib/api/response";
import { startProject } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";

export async function POST(req: Request) {
  return handle(async () => {
    const { user } = await requireUser();
    const body = z.object({ prompt: z.string().min(1).max(2000), contentCount: z.number().int().min(1).max(8).optional(), deferGeneration: z.boolean().optional() }).parse(await req.json());
    return startProject({ ownerId: user.id, prompt: body.prompt, contentCount: body.contentCount, deferGeneration: body.deferGeneration });
  }, 201);
}

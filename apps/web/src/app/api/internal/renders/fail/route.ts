import { z } from "zod";
import { handle } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { failRender } from "@/lib/server/renders";

const Body = z.object({ renderId: z.string().uuid(), error: z.string().default("Render failed") });

export async function POST(req: Request) {
  return handle(async () => {
    assertInternalServiceAuth(req);
    const body = Body.parse(await req.json());
    return failRender(body.renderId, body.error);
  });
}

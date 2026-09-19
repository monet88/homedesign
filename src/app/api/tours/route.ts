import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { createTour, listUserTours } from "@/lib/panorama/tour-service";
import { CreateTourSchema } from "@/lib/panorama/types";

export async function GET(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");

  try {
    const tours = await listUserTours(env.DB, auth.userId, workspaceId);
    return Response.json({
      code: 0,
      data: {
        success: true,
        items: tours,
        tours,
      },
    });
  } catch (err: unknown) {
    return designErrorResponse(err);
  }
}

export async function POST(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const rawBody = await readJson(request);
  if (rawBody instanceof Response) return rawBody;

  const parse = CreateTourSchema.safeParse(rawBody);
  if (!parse.success) {
    return Response.json(
      { error: "VALIDATION_ERROR", details: parse.error.format() },
      { status: 400 }
    );
  }

  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  try {
    const tour = await createTour(env.DB, auth.userId, parse.data);
    return Response.json({
      code: 0,
      data: {
        success: true,
        tour,
      },
    });
  } catch (err: unknown) {
    return designErrorResponse(err);
  }
}

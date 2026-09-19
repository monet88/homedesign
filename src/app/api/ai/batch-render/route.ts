import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { createBatchRenderJob, listBatchRenderJobs, MAX_BATCH_ITEMS } from "@/lib/batch/batch-service";
import type { BatchItemPayload } from "@/lib/batch/types";

export async function POST(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  const rawBody = await readJson(request);
  if (rawBody instanceof Response) return rawBody;

  const body = rawBody as {
    name?: string;
    workspaceId?: string;
    items?: BatchItemPayload[];
    provider?: string;
  };

  const items = body?.items;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return Response.json(
      { error: "INVALID_ITEMS", message: "Vui lòng chọn ít nhất 1 ảnh/phòng để render" },
      { status: 400 }
    );
  }

  const ALLOWED_PROVIDERS = new Set(["fal", "gemini", "replicate", "kie", "smart", "default", "fake"]);
  if (body.provider && !ALLOWED_PROVIDERS.has(body.provider.toLowerCase().trim())) {
    return Response.json(
      { error: "INVALID_PROVIDER", message: "Nhà cung cấp AI không hợp lệ" },
      { status: 400 }
    );
  }

  if (items.length > MAX_BATCH_ITEMS) {
    return Response.json(
      {
        error: "BATCH_MAX_ITEMS_EXCEEDED",
        message: `Tối đa ${MAX_BATCH_ITEMS} ảnh/phòng cho một lượt render hàng loạt`,
      },
      { status: 400 }
    );
  }

  try {
    const job = await createBatchRenderJob(env, {
      userId: auth.userId,
      workspaceId: body.workspaceId,
      name: body.name || `Batch Căn Hộ (${items.length} phòng)`,
      items,
      provider: body.provider,
    });

    return Response.json({
      code: 0,
      data: {
        success: true,
        batch: job,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "INTERNAL_ERROR";
    if (msg.includes("FORBIDDEN")) {
      return Response.json(
        {
          error: "FORBIDDEN",
          message: "Bạn không phải thành viên của workspace này",
        },
        { status: 403 }
      );
    }
    if (msg.includes("ROLE_CANNOT_GENERATE")) {
      return Response.json(
        {
          error: "ROLE_CANNOT_GENERATE",
          message: "Viewer không có quyền tạo batch render trong workspace này",
        },
        { status: 403 }
      );
    }
    if (msg === "INSUFFICIENT_CREDITS") {
      return Response.json(
        {
          error: "INSUFFICIENT_CREDITS",
          message: "Số dư credits không đủ để render trọn bộ căn hộ này",
        },
        { status: 402 }
      );
    }
    return designErrorResponse(err);
  }
}

export async function GET(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const cf = await getCloudflareContext({ async: true });
  const env = (cf.env as unknown as Env) || (auth.env as unknown as Env);

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId") || undefined;

  try {
    const jobs = await listBatchRenderJobs(env, auth.userId, workspaceId);
    return Response.json({
      code: 0,
      data: {
        success: true,
        batches: jobs,
      },
    });
  } catch (err: unknown) {
    return designErrorResponse(err);
  }
}

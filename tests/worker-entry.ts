// Test-only Worker entry for the vitest-pool-workers runtime harness.
// The real app entry is `.open-next/worker.js` (OpenNext build output); tests
// must not depend on a full OpenNext build, so this minimal worker exposes the
// bindings and the fake-provider pipeline directly. Later tickets keep using
// this entry for Workers-runtime integration tests.

import { runFakeProviderPipeline } from "@/lib/ai/fake-provider";
import type { Env } from "@/lib/bindings";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/__test/health") {
      return Response.json({
        ok: true,
        environment: env.ENVIRONMENT,
        hasD1: typeof env.DB !== "undefined",
        hasR2: typeof env.HD_PRIVATE !== "undefined",
        hasQueue: typeof env.ASSET_VALIDATE !== "undefined",
      });
    }

    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  },

  // Consume provider notifications into D1 queue_events so at-least-once
  // delivery is observable in the harness.
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      await env.DB.prepare(
        `INSERT INTO queue_events (queue, body, received_at) VALUES (?1, ?2, ?3)`
      )
        .bind(batch.queue, JSON.stringify(msg.body), Date.now())
        .run();
    }
  },
};

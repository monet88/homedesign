// 24-hour intake expiry reconciler (ADR 0003): pending-upload and quarantined
// Assets with elapsed `purge_at` are rejected and their quarantine bytes deleted.

import type { Env } from "@/lib/bindings";

export const INTAKE_EXPIRY_MS = 24 * 60 * 60 * 1000;

export interface IntakeExpiryResult {
  expired: number;
}

export async function reconcileIntakeExpiry(env: Env): Promise<IntakeExpiryResult> {
  const now = Date.now();
  const rows = await env.DB.prepare(
    `SELECT id, storage_key, lifecycle FROM assets
     WHERE lifecycle IN ('pending-upload', 'quarantined')
       AND purge_at IS NOT NULL
       AND purge_at <= ?1`
  )
    .bind(now)
    .all<{ id: string; storage_key: string | null; lifecycle: string }>();

  let expired = 0;
  for (const row of rows.results ?? []) {
    if (row.storage_key && row.lifecycle === "quarantined") {
      await env.HD_PRIVATE.delete(row.storage_key);
    }
    const result = await env.DB.prepare(
      `UPDATE assets SET lifecycle = 'rejected', updated_at = ?2, purge_at = NULL
       WHERE id = ?1 AND lifecycle IN ('pending-upload', 'quarantined')`
    )
      .bind(row.id, now)
      .run();
    if (result.meta.changes > 0) expired++;
  }

  return { expired };
}

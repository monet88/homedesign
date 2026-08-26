"use client";

// Browser-side intake helpers (ticket #14). These wrap the authenticated
// upload-intent / finalize / asset-status endpoints defined in ticket #6.

export interface UploadResult {
  ok: true;
  assetId: string;
  lifecycle: string;
}

export interface UploadError {
  ok: false;
  error: string;
  status?: number;
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; reason?: string };
    return data.reason ?? data.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/**
 * Upload a PNG/JPG/JPEG file through the presigned-PUT pipeline and poll until
 * the Asset reaches a terminal lifecycle (`ready` or `rejected`).
 */
export async function uploadAsset(file: File): Promise<UploadResult | UploadError> {
  const intentRes = await fetch("/api/assets/upload-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      name: file.name,
      mimeType: file.type,
      size: file.size,
    }),
  });

  if (!intentRes.ok) {
    return { ok: false, error: await readError(intentRes), status: intentRes.status };
  }

  const intentData = (await intentRes.json()) as {
    code: number;
    data: { assetId: string; presignedUrl: string | null; expiresInSec: number };
  };
  const { assetId, presignedUrl } = intentData.data;

  if (presignedUrl) {
    const putRes = await fetch(presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!putRes.ok) {
      return { ok: false, error: `Upload failed: HTTP ${putRes.status}`, status: putRes.status };
    }
  }

  const finalizeRes = await fetch("/api/assets/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ assetId }),
  });

  if (!finalizeRes.ok) {
    return { ok: false, error: await readError(finalizeRes), status: finalizeRes.status };
  }

  // Poll until the validation worker promotes the asset to `ready`.
  const terminal = await pollAssetReady(assetId, { intervalMs: 1500, maxWaitMs: 120_000 });
  if (!terminal.ok) return terminal;

  return { ok: true, assetId, lifecycle: terminal.lifecycle };
}

interface PollOptions {
  intervalMs: number;
  maxWaitMs: number;
}

export async function pollAssetReady(
  assetId: string,
  options: PollOptions = { intervalMs: 1500, maxWaitMs: 120_000 }
): Promise<{ ok: true; lifecycle: string } | UploadError> {
  const deadline = Date.now() + options.maxWaitMs;

  while (Date.now() < deadline) {
    const res = await fetch(`/api/assets/${assetId}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    });

    if (!res.ok) {
      return { ok: false, error: await readError(res), status: res.status };
    }

    const data = (await res.json()) as {
      code: number;
      data: { lifecycle: string };
    };
    const lifecycle = data.data.lifecycle;

    if (lifecycle === "ready") {
      return { ok: true, lifecycle };
    }
    if (lifecycle === "rejected") {
      return { ok: false, error: "Image was rejected during validation." };
    }

    await delay(options.intervalMs);
  }

  return { ok: false, error: "Timed out waiting for the uploaded image to be ready." };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

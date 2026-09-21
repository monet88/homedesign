// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { GET as getTourAssetRoute } from "./[assetId]/route";
import { deliverTourSceneAsset } from "@/lib/panorama/tour-service";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

vi.mock("@/lib/panorama/tour-service", () => ({
  deliverTourSceneAsset: vi.fn(),
}));

describe("GET /api/tours/share/[token]/assets/[assetId]", () => {
  it("returns 404 when asset does not belong to public tour", async () => {
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: { DB: {} } } as any);
    vi.mocked(deliverTourSceneAsset).mockResolvedValue(null);

    const req = new Request("http://localhost/api/tours/share/tok-1/assets/asset-missing");
    const res = await getTourAssetRoute(req, {
      params: Promise.resolve({ token: "tok-1", assetId: "asset-missing" }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error).toBe("NOT_FOUND");
  });

  it("returns 200 with inline image response when asset is verified", async () => {
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: { DB: {} } } as any);
    const mockImageResponse = new Response("fake-image-bytes", {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": "inline",
      },
    });
    vi.mocked(deliverTourSceneAsset).mockResolvedValue(mockImageResponse);

    const req = new Request("http://localhost/api/tours/share/tok-1/assets/asset-valid");
    const res = await getTourAssetRoute(req, {
      params: Promise.resolve({ token: "tok-1", assetId: "asset-valid" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Content-Disposition")).toBe("inline");
    expect(await res.text()).toBe("fake-image-bytes");
  });
});

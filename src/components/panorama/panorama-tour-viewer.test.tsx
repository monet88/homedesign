// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PanoramaTourViewer, isWebGLAvailable } from "./panorama-tour-viewer";
import type { PanoramaScene } from "@/lib/panorama/types";

const mockScenes: PanoramaScene[] = [
  {
    id: "scene-living",
    tourId: "tour-1",
    name: "Phòng khách Tân Cổ Điển",
    assetId: "asset-pano-living",
    initialYaw: 10,
    initialPitch: 0,
    initialHfov: 100,
    orderIndex: 0,
    createdAt: Date.now(),
    hotspots: [
      {
        id: "hs-1",
        sceneId: "scene-living",
        targetSceneId: "scene-bed",
        type: "scene",
        pitch: -5,
        yaw: 45,
        title: "Sang phòng ngủ",
        description: null,
        createdAt: Date.now(),
      },
      {
        id: "hs-2",
        sceneId: "scene-living",
        targetSceneId: null,
        type: "info",
        pitch: 15,
        yaw: -30,
        title: "Sàn đá Marble Crema",
        description: "Đá tự nhiên nhập khẩu Tây Ban Nha",
        createdAt: Date.now(),
      },
    ],
  },
  {
    id: "scene-bed",
    tourId: "tour-1",
    name: "Phòng ngủ Master",
    assetId: "asset-pano-bed",
    initialYaw: 0,
    initialPitch: 0,
    initialHfov: 100,
    orderIndex: 1,
    createdAt: Date.now(),
    hotspots: [],
  },
];

describe("isWebGLAvailable", () => {
  it("returns false when WebGL context is unavailable", () => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as typeof getContext;
    expect(isWebGLAvailable()).toBe(false);
    HTMLCanvasElement.prototype.getContext = getContext;
  });
});

describe("PanoramaTourViewer", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "HTMLCanvasElement",
      class extends HTMLCanvasElement {
        getContext() {
          return null;
        }
      }
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows static panorama fallback when WebGL is unavailable", () => {
    render(<PanoramaTourViewer scenes={mockScenes} initialSceneId="scene-living" />);

    expect(screen.getByTestId("panorama-static-fallback")).toBeTruthy();
    const img = screen.getByRole("img", { name: "Phòng khách Tân Cổ Điển" });
    expect(img.getAttribute("src")).toBe("/api/assets/asset-pano-living/download?inline=1");
    expect(screen.getByText(/Trình duyệt không hỗ trợ WebGL/)).toBeTruthy();
  });

  it("renders empty state message when scenes array is empty", () => {
    render(<PanoramaTourViewer scenes={[]} />);

    expect(screen.getByText("Chưa có căn phòng 360 nào trong Tour này.")).toBeTruthy();
  });

  it("shows fallback for the selected initialSceneId", () => {
    render(<PanoramaTourViewer scenes={mockScenes} initialSceneId="scene-bed" />);

    const img = screen.getByRole("img", { name: "Phòng ngủ Master" });
    expect(img.getAttribute("src")).toBe("/api/assets/asset-pano-bed/download?inline=1");
  });

  it("resolves token-authorized public asset URL when shareToken is provided", () => {
    render(
      <PanoramaTourViewer
        scenes={mockScenes}
        initialSceneId="scene-living"
        shareToken="tok-public-xyz"
      />
    );

    const img = screen.getByRole("img", { name: "Phòng khách Tân Cổ Điển" });
    expect(img.getAttribute("src")).toBe("/api/tours/share/tok-public-xyz/assets/asset-pano-living");
  });
});

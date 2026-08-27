// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PanoramaViewer, isWebGLAvailable } from "./panorama-viewer";

describe("isWebGLAvailable", () => {
  it("returns false when WebGL context is unavailable", () => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as typeof getContext;
    expect(isWebGLAvailable()).toBe(false);
    HTMLCanvasElement.prototype.getContext = getContext;
  });
});

describe("PanoramaViewer", () => {
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
    vi.unstubAllGlobals();
  });

  it("shows static panorama preview when WebGL is unavailable", () => {
    render(
      <PanoramaViewer assetId="asset-pano-1" orientation={{ yaw: 0, pitch: 0, hfov: 100 }} />
    );

    expect(screen.getByTestId("panorama-static-fallback")).toBeTruthy();
    const img = screen.getByRole("img", { name: "Room panorama" });
    expect(img.getAttribute("src")).toBe("/api/assets/asset-pano-1/download");
    expect(screen.queryByTestId("panorama-viewer")).toBeNull();
  });
});

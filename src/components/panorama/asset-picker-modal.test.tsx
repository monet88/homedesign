// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AssetPickerModal, isLikelyPanorama, type AssetItem } from "./asset-picker-modal";

afterEach(cleanup);

describe("AssetPickerModal & isLikelyPanorama helper", () => {
  it("correctly identifies panorama assets by naming convention", () => {
    expect(isLikelyPanorama({ id: "a1", name: "living_room_panorama_360.jpg" })).toBe(true);
    expect(isLikelyPanorama({ id: "a2", name: "bedroom-pano-equirectangular.png" })).toBe(true);
    expect(isLikelyPanorama({ id: "a3", name: "vr_tour_sphere.jpg" })).toBe(true);
    expect(isLikelyPanorama({ id: "a4", name: "photo_2026-09-14_09-18-03.jpg" })).toBe(false);
    expect(isLikelyPanorama({ id: "a5", name: "floor_plan_2d.png" })).toBe(false);
  });

  it("renders asset picker modal, filters tabs, and allows selection with preview", () => {
    const mockAssets: AssetItem[] = [
      { id: "asset-pano-1", name: "Living Room 360 Pano.jpg", createdAt: 1700000000000 },
      { id: "asset-2d-2", name: "Facade Render 2D.jpg", createdAt: 1700000000000 },
    ];

    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(
      <AssetPickerModal
        isOpen={true}
        onClose={onClose}
        onSelect={onSelect}
        assets={mockAssets}
        selectedAssetId="asset-pano-1"
      />
    );

    // Modal title & tabs should be present
    expect(screen.getByText(/Thư Viện Ảnh — Chọn Ảnh Cho VR Tour 360°/)).toBeTruthy();
    expect(screen.getByText(/Tất cả \(2\)/)).toBeTruthy();
    expect(screen.getByText(/Panorama 360° \(1\)/)).toBeTruthy();

    // Click tab Panorama only
    fireEvent.click(screen.getByText(/Panorama 360° \(1\)/));
    expect(screen.getAllByText("Living Room 360 Pano.jpg").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Facade Render 2D.jpg")).toBeNull();

    // Confirm selection button
    const confirmBtn = screen.getByText(/Xác Nhận Chọn Ảnh Này/);
    fireEvent.click(confirmBtn);
    expect(onSelect).toHaveBeenCalledWith(mockAssets[0]);
    expect(onClose).toHaveBeenCalled();
  });
});

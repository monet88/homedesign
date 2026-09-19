// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TourViewPanel from "./tour-view";
import { generateMetadata } from "./page";
import type { PanoramaTour } from "@/lib/panorama/types";
import type { StudioBranding } from "@/lib/branding/types";

// Mock @opennextjs/cloudflare
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({
    env: {
      DB: {},
      BETTER_AUTH_URL: "https://design.7app.online",
    },
  })),
}));

// Mock tour-service
vi.mock("@/lib/panorama/tour-service", () => ({
  getTourByShareToken: vi.fn(async (_db, token: string) => {
    if (token === "token-valid") {
      return {
        id: "tour-1",
        workspaceId: "ws-1",
        projectId: "proj-1",
        userId: "user-1",
        title: "Biệt Thự Đảo Ecopark",
        description: "Thiết kế Luxury Indochine",
        firstSceneId: "scene-1",
        isPublic: true,
        shareToken: "token-valid",
        createdAt: 1000,
        updatedAt: 1000,
        scenes: [
          {
            id: "scene-1",
            tourId: "tour-1",
            name: "Phòng khách",
            assetId: "asset-1",
            initialYaw: 0,
            initialPitch: 0,
            initialHfov: 100,
            orderIndex: 0,
            createdAt: 1000,
            hotspots: [],
          },
        ],
      };
    }
    return null;
  }),
}));

describe("generateMetadata for /tour/[token]", () => {
  it("returns fallback metadata when tour does not exist", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ token: "token-missing" }) });
    expect(meta.title).toContain("3D Panorama VR Tour");
  });

  it("returns SEO metadata with OpenGraph when tour exists", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ token: "token-valid" }) });
    expect(meta.title).toContain("Biệt Thự Đảo Ecopark");
    expect(meta.openGraph?.title).toContain("Biệt Thự Đảo Ecopark");
  });
});

describe("TourViewPanel Component", () => {
  it("renders not found state when tour is null", () => {
    render(<TourViewPanel token="token-null" tour={null} branding={null} />);
    expect(screen.getByText("Bản xem thực tế ảo không khả dụng")).toBeTruthy();
    expect(screen.getByText("Trở về trang chủ HomeDesign")).toBeTruthy();
  });

  it("renders tour title and Studio branding when tour exists", () => {
    const mockTour: PanoramaTour = {
      id: "tour-1",
      workspaceId: "ws-1",
      projectId: "proj-1",
      userId: "user-1",
      title: "Căn hộ Penthouse Landmark 81",
      description: "Góc nhìn Panorama 360",
      firstSceneId: "scene-1",
      isPublic: true,
      shareToken: "token-penthouse",
      createdAt: 1000,
      updatedAt: 1000,
      scenes: [
        {
          id: "scene-1",
          tourId: "tour-1",
          name: "Phòng khách Panorama",
          assetId: "asset-penthouse",
          initialYaw: 0,
          initialPitch: 0,
          initialHfov: 100,
          orderIndex: 0,
          createdAt: 1000,
          hotspots: [],
        },
      ],
    };

    const mockBranding: StudioBranding = {
      workspaceId: "ws-1",
      brandName: "Kiến Trúc Hoàn Mỹ",
      brandLogoUrl: "https://r2.7app.online/logo.png",
      watermarkEnabled: true,
      watermarkText: "© KIẾN TRÚC HOÀN MỸ",
      watermarkPosition: "bottom-right",
      contactPhone: "0909123456",
    };

    render(<TourViewPanel token="token-penthouse" tour={mockTour} branding={mockBranding} />);

    expect(screen.getByText("Căn hộ Penthouse Landmark 81")).toBeTruthy();
    expect(screen.getAllByText(/Kiến Trúc Hoàn Mỹ/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/0909123456/)).toBeTruthy();
    expect(screen.getByText("© KIẾN TRÚC HOÀN MỸ")).toBeTruthy();
    expect(screen.getByText("Chia sẻ & Nhúng")).toBeTruthy();
  });
});

// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import TourDashboardPage from "./page";

vi.mock("@/lib/auth/session-stub", () => ({
  useSession: vi.fn(() => ({
    user: {
      id: "user-test-1",
      name: "Architect KTS",
      initial: "A",
      email: "architect@example.com",
      emailVerified: true,
      role: "user",
    },
    credits: 10,
    loading: false,
  })),
}));

describe("TourDashboardPage (/tour)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/tours")) {
        return {
          ok: true,
          json: async () => ({
            code: 0,
            data: {
              tours: [
                {
                  id: "tour-1",
                  workspaceId: null,
                  projectId: null,
                  userId: "user-test-1",
                  title: "Villa Đảo Ecopark",
                  description: "Tour 360 toàn cảnh biệt thự",
                  firstSceneId: "scene-1",
                  isPublic: true,
                  shareToken: "token-ecopark",
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
                },
              ],
            },
          }),
        } as Response;
      }
      if (url.includes("/api/assets")) {
        return {
          ok: true,
          json: async () => ({
            data: { items: [] },
          }),
        } as Response;
      }
      return { ok: false } as Response;
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders page title and tours list successfully", async () => {
    render(<TourDashboardPage />);

    expect(screen.getByText("VR Tour 360° Studio")).toBeTruthy();
    expect(screen.getByText("+ Tạo VR Tour Mới")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("Villa Đảo Ecopark")).toBeTruthy();
      expect(screen.getByText("Tour 360 toàn cảnh biệt thự")).toBeTruthy();
      expect(screen.getByText("Chỉnh sửa")).toBeTruthy();
      expect(screen.getByText("Xem")).toBeTruthy();
      expect(screen.getByText("QR")).toBeTruthy();
      expect(screen.getByText("Penthouse Horizon Sky Villa (Demo VR 360°)")).toBeTruthy();
    });
  });
});

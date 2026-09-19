// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { FloorPlanFlow } from "./floor-plan-flow";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams({ project: "proj-1" }),
}));

vi.mock("@/lib/auth/session-stub", () => ({
  useSession: () => ({
    user: { id: "user-1", email: "test@example.com" },
    loading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/components/design/uploader", () => ({
  Uploader: () => <div data-testid="uploader-stub" />,
}));

vi.mock("@/components/floor-plan/panorama-viewer", () => ({
  PanoramaViewer: () => <div data-testid="pano-stub" />,
}));

vi.mock("@/components/payments/mock-payment-modal", () => ({
  MockPaymentModal: () => null,
}));

describe("FloorPlanFlow Marker Selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("stops propagation when room marker is clicked and selects room without calling placeMarker", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/floor-plan/projects/proj-1")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            code: 0,
            data: {
              id: "proj-1",
              sourceAssetId: "asset-1",
              rooms: [
                {
                  id: "room-1",
                  markerId: "marker-1",
                  marker: { x: 20, y: 30 },
                  markerLocked: true,
                  complete: false,
                  stageRuns: [],
                  proposal: { recognition: { roomType: "Living Room" } },
                },
                {
                  id: "room-2",
                  markerId: "marker-2",
                  marker: { x: 70, y: 80 },
                  markerLocked: true,
                  complete: true,
                  stageRuns: [],
                  proposal: { recognition: { roomType: "Bedroom" } },
                },
              ],
              overview: { totalRooms: 2, completeRooms: 1, currentRoomId: "room-1" },
              processingTasks: [],
            },
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ code: 0 }),
      } as Response);
    });

    global.fetch = fetchMock;

    render(<FloorPlanFlow />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Select Bedroom marker" })).toBeTruthy();
    });

    const bedroomMarker = screen.getByRole("button", { name: "Select Bedroom marker" });

    // Clicking bedroom marker
    fireEvent.click(bedroomMarker);

    // Verify fetch was NOT called for /api/floor-plan/room-designs/.../marker (placeMarker)
    const markerUpdateCalls = fetchMock.mock.calls.filter((call) =>
      typeof call[0] === "string" && call[0].includes("/marker")
    );
    expect(markerUpdateCalls).toHaveLength(0);
  });
});

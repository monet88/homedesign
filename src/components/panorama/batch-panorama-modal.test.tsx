// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { BatchPanoramaModal } from "./batch-panorama-modal";

afterEach(cleanup);

describe("BatchPanoramaModal Component (Sprint 11 - Ticket 11.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <BatchPanoramaModal isOpen={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders with default rooms and styles when isOpen is true", () => {
    render(<BatchPanoramaModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText(/AI Batch 360° Panorama Studio Generator/i)).toBeDefined();
    expect(screen.getByText("Modern Luxury")).toBeDefined();
    expect(screen.getByText("Japandi Warm")).toBeDefined();
    expect(screen.getByDisplayValue("Căn Hộ Horizon Sky Villa")).toBeDefined();
    expect(screen.getByDisplayValue("Phòng Khách Skyview")).toBeDefined();
    expect(screen.getByDisplayValue("Bếp & Quầy Bar Đảo")).toBeDefined();
    expect(screen.getByDisplayValue("Phòng Ngủ Master")).toBeDefined();
  });

  it("allows adding and removing rooms within limits", () => {
    render(<BatchPanoramaModal isOpen={true} onClose={vi.fn()} />);

    const addBtn = screen.getByRole("button", { name: "+ Thêm Phòng" });
    fireEvent.click(addBtn);

    // Now has 4 rooms
    expect(screen.getByText(/Danh Sách Phòng Căn Hộ \(4\/8\)/i)).toBeDefined();

    // Click delete on the last room
    const deleteButtons = screen.getAllByTitle("Xóa phòng này");
    expect(deleteButtons.length).toBe(4);
    fireEvent.click(deleteButtons[3]);

    // Back to 3 rooms
    expect(screen.getByText(/Danh Sách Phòng Căn Hộ \(3\/8\)/i)).toBeDefined();
  });

  it("triggers API call on submit with proper payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          tour: { id: "tour-999", shareToken: "token999" },
          batchJobId: "job-999",
          totalCreditsCost: 3,
        },
      }),
    });
    global.fetch = fetchMock as any;

    const onSuccess = vi.fn();
    render(<BatchPanoramaModal isOpen={true} onClose={vi.fn()} onSuccess={onSuccess} />);

    const submitBtn = screen.getByRole("button", { name: /Khởi Tạo Trọn Bộ Tour 360°/i });
    fireEvent.click(submitBtn);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/batch-panorama",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );
  });
});


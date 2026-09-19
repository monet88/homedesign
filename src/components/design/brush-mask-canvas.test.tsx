// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BrushMaskCanvas } from "./brush-mask-canvas";

describe("BrushMaskCanvas", () => {
  const defaultProps = {
    imageSrc: "https://example.com/test-room.jpg",
    onMaskChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(4),
        width: 1,
        height: 1,
      })),
      putImageData: vi.fn(),
    })) as any;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders brush controls, undo/redo buttons and canvas", () => {
    render(<BrushMaskCanvas {...defaultProps} />);

    expect(screen.getByText("Brush:")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Small" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Medium" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Large" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Undo mask stroke" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Redo mask stroke" })).toBeTruthy();
  });

  it("changes brush size when size button is clicked", () => {
    render(<BrushMaskCanvas {...defaultProps} />);

    const largeBtn = screen.getByRole("button", { name: "Large" });
    fireEvent.click(largeBtn);
    expect(largeBtn.className).toContain("bg-brand-primary");
  });

  it("changes brush size via [ and ] keyboard shortcuts", () => {
    render(<BrushMaskCanvas {...defaultProps} />);

    const smallBtn = screen.getByRole("button", { name: "Small" });
    const medBtn = screen.getByRole("button", { name: "Medium" });
    const largeBtn = screen.getByRole("button", { name: "Large" });

    // Initial is medium (30)
    expect(medBtn.className).toContain("bg-brand-primary");

    // Press '[' to decrease
    fireEvent.keyDown(window, { key: "[" });
    expect(smallBtn.className).toContain("bg-brand-primary");

    // Press ']' twice to increase to medium, then large
    fireEvent.keyDown(window, { key: "]" });
    expect(medBtn.className).toContain("bg-brand-primary");

    fireEvent.keyDown(window, { key: "]" });
    expect(largeBtn.className).toContain("bg-brand-primary");
  });

  it("calls onMaskChange on mouse drawing completion, supports Undo/Redo and Clear", () => {
    const onMaskChange = vi.fn();
    render(<BrushMaskCanvas {...defaultProps} onMaskChange={onMaskChange} />);

    const canvas = document.querySelector("canvas");
    expect(canvas).toBeTruthy();
    if (!canvas) return;

    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 300,
      bottom: 300,
      right: 400,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    vi.spyOn(canvas, "toDataURL").mockReturnValue("data:image/png;base64,mockmask");

    // Draw stroke 1
    fireEvent.mouseDown(canvas, { clientX: 50, clientY: 50 });
    fireEvent.mouseMove(canvas, { clientX: 60, clientY: 60 });
    fireEvent.mouseUp(canvas);

    expect(onMaskChange).toHaveBeenCalledWith("data:image/png;base64,mockmask");

    // Undo button should now be enabled
    const undoBtn = screen.getByRole("button", { name: "Undo mask stroke" });
    expect(undoBtn.hasAttribute("disabled")).toBe(false);

    // Test Undo via Ctrl+Z
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    // After undoing the only stroke, mask is reset
    expect(onMaskChange).toHaveBeenLastCalledWith(null);

    // Test Redo via Ctrl+Y
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(onMaskChange).toHaveBeenLastCalledWith("data:image/png;base64,mockmask");

    // Clear Mask button
    const clearBtn = screen.getByRole("button", { name: "Clear Mask" });
    expect(clearBtn).toBeTruthy();

    fireEvent.click(clearBtn);
    expect(onMaskChange).toHaveBeenCalledWith(null);
  });

  it("resets mask and calls onMaskChange(null) when imageSrc changes", () => {
    const onMaskChange = vi.fn();
    const { rerender } = render(<BrushMaskCanvas {...defaultProps} onMaskChange={onMaskChange} />);

    // Simulate image change
    rerender(<BrushMaskCanvas {...defaultProps} imageSrc="https://example.com/new-room.jpg" onMaskChange={onMaskChange} />);

    // Global Image onload trigger is mocked or image load invokes onMaskChange(null)
    expect(onMaskChange).toHaveBeenCalledWith(null);
  });
});

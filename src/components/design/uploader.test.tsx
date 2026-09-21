// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Uploader } from "./uploader";
import * as clientModule from "@/lib/intake/client";

vi.mock("@/lib/intake/client", () => ({
  uploadAsset: vi.fn(),
}));

describe("Uploader Dropzone", () => {
  const defaultProps = {
    scene: "interior" as const,
    sceneLabel: "living room",
    onReady: vi.fn(),
    onError: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders upload prompt and handles dragover without navigation", () => {
    render(<Uploader {...defaultProps} />);

    const dropzone = screen.getByLabelText("Upload a living room photo").parentElement!;
    expect(dropzone).toBeTruthy();

    const dragOverEvent = new Event("dragover", { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(dragOverEvent, "preventDefault");
    const stopPropagationSpy = vi.spyOn(dragOverEvent, "stopPropagation");

    dropzone.dispatchEvent(dragOverEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it("sets and resets drag active style on dragenter and dragleave", () => {
    render(<Uploader {...defaultProps} />);

    const dropzone = screen.getByLabelText("Upload a living room photo").parentElement!;

    fireEvent.dragEnter(dropzone);
    expect(dropzone.className).toContain("border-brand-primary");

    fireEvent.dragLeave(dropzone);
    expect(dropzone.className).toContain("border-border/80");
  });

  it("handles dropped image file, calls uploadAsset, and prevents browser navigation", async () => {
    const uploadSpy = vi.spyOn(clientModule, "uploadAsset").mockResolvedValue({
      ok: true,
      assetId: "asset-123",
      lifecycle: "ready",
    });

    render(<Uploader {...defaultProps} />);

    const dropzone = screen.getByLabelText("Upload a living room photo").parentElement!;
    const file = new File(["dummy content"], "test-room.png", { type: "image/png" });

    const dropEvent = new Event("drop", { bubbles: true, cancelable: true }) as any;
    dropEvent.dataTransfer = { files: [file] };
    const preventDefaultSpy = vi.spyOn(dropEvent, "preventDefault");
    const stopPropagationSpy = vi.spyOn(dropEvent, "stopPropagation");

    dropzone.dispatchEvent(dropEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(stopPropagationSpy).toHaveBeenCalled();
    expect(uploadSpy).toHaveBeenCalledWith(file);
  });

  it("loads WebP sample preset and uploads it as image/webp", async () => {
    const uploadSpy = vi.spyOn(clientModule, "uploadAsset").mockResolvedValue({
      ok: true,
      assetId: "asset-sample-1",
      lifecycle: "ready",
    });

    global.fetch = vi.fn().mockResolvedValue({
      blob: async () => new Blob(["webp-content"], { type: "image/webp" }),
    } as Response);

    render(<Uploader {...defaultProps} />);

    const sampleButton = screen.getByRole("button", { name: /Warm modern living room/i });
    fireEvent.click(sampleButton);

    await vi.waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "image/webp",
          name: "warm-modern-living-room.webp",
        })
      );
    });
  });
});

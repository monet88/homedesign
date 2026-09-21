// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BeforeAfter } from "./before-after";

describe("BeforeAfter comparison slider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders accessible range input slider with value 50 and updates on change", () => {
    render(<BeforeAfter />);

    const slider = screen.getByRole("slider", { name: "Before After slider" });
    expect(slider).toBeTruthy();
    expect((slider as HTMLInputElement).value).toBe("50");

    // Change value
    fireEvent.change(slider, { target: { value: "35" } });
    expect((slider as HTMLInputElement).value).toBe("35");
  });

  it("resets position to 50 when switching category tabs", () => {
    render(<BeforeAfter showTabs={true} />);

    const slider = screen.getByRole("slider", { name: "Before After slider" });
    fireEvent.change(slider, { target: { value: "20" } });
    expect((slider as HTMLInputElement).value).toBe("20");

    // Switch to Exterior tab
    const exteriorTab = screen.getByRole("tab", { name: "Exterior" });
    fireEvent.click(exteriorTab);

    // Position resets to 50
    expect((slider as HTMLInputElement).value).toBe("50");
  });
});

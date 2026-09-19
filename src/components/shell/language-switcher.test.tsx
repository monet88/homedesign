// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LanguageSwitcher } from "./language-switcher";
import { LanguageProvider } from "@/lib/i18n/context";

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders trigger button, opens dropdown, and closes on Escape key", () => {
    render(
      <LanguageProvider>
        <LanguageSwitcher />
      </LanguageProvider>
    );

    const trigger = screen.getByRole("button", { expanded: false });
    expect(trigger).toBeTruthy();
    expect(screen.queryByRole("menu")).toBeNull();

    // Click trigger to open dropdown
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();

    // Press Escape to close dropdown
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("changes language and closes menu when selecting an option", () => {
    render(
      <LanguageProvider>
        <LanguageSwitcher />
      </LanguageProvider>
    );

    const trigger = screen.getByRole("button", { expanded: false });
    fireEvent.click(trigger);

    // Select Tiếng Việt
    const viOption = screen.getByRole("menuitem", { name: /Tiếng Việt/i });
    fireEvent.click(viOption);

    // Menu closes and trigger shows Tiếng Việt
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByText("Tiếng Việt")).toBeTruthy();
  });
});

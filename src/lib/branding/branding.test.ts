import { describe, it, expect, vi, beforeEach } from "vitest";
import { getWorkspaceBranding, updateWorkspaceBranding } from "./branding-service";
import type { Env } from "@/lib/bindings";

vi.mock("@/lib/workspaces/workspaces", () => ({
  getWorkspace: vi.fn(),
}));

vi.mock("@/lib/audit/audit-logger", () => ({
  recordWorkspaceAuditLog: vi.fn(),
}));

import { getWorkspace } from "@/lib/workspaces/workspaces";
import { recordWorkspaceAuditLog } from "@/lib/audit/audit-logger";

describe("White-Label Studio Branding Service (Sprint 9 - Ticket 9.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retrieves workspace branding with default fallback values", async () => {
    const firstMock = vi.fn().mockResolvedValue({
      id: "ws-1",
      name: "Studio Nhà Đẹp",
      brand_logo_url: "https://r2.7app.online/logo.png",
      brand_name: "Nhà Đẹp Architects",
      brand_tagline: "Kiến trúc tinh hoa",
      contact_phone: "0901234567",
      contact_email: "contact@nhadep.vn",
      contact_address: "Quận 1, TP. HCM",
      watermark_enabled: 1,
      watermark_text: "© NHÀ ĐẸP ARCHITECTS",
      watermark_position: "bottom-right",
    });

    const bindMock = vi.fn().mockReturnValue({ first: firstMock });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

    const fakeEnv = {
      DB: { prepare: prepareMock },
    } as unknown as Env;

    const branding = await getWorkspaceBranding(fakeEnv, "ws-1");

    expect(branding.brandName).toBe("Nhà Đẹp Architects");
    expect(branding.brandLogoUrl).toBe("https://r2.7app.online/logo.png");
    expect(branding.watermarkEnabled).toBe(true);
    expect(branding.watermarkText).toBe("© NHÀ ĐẸP ARCHITECTS");
  });

  it("forbids non-owners from updating workspace branding", async () => {
    vi.mocked(getWorkspace).mockResolvedValue({
      id: "ws-1",
      name: "Studio Nhà Đẹp",
      role: "architect", // Not owner!
    } as any);

    const fakeEnv = {} as Env;

    await expect(
      updateWorkspaceBranding(fakeEnv, "ws-1", "user-architect", {
        brandName: "Hacked Studio",
      })
    ).rejects.toThrow("FORBIDDEN_PERMISSION_DENIED");
  });

  it("updates studio branding and records audit log when caller is owner", async () => {
    vi.mocked(getWorkspace).mockResolvedValue({
      id: "ws-1",
      name: "Studio Nhà Đẹp",
      role: "owner",
    } as any);

    const firstMock = vi.fn().mockResolvedValue({
      id: "ws-1",
      name: "Studio Nhà Đẹp",
      brand_logo_url: null,
      brand_name: null,
      brand_tagline: null,
      contact_phone: null,
      contact_email: null,
      contact_address: null,
      watermark_enabled: 1,
      watermark_text: null,
      watermark_position: "bottom-right",
    });

    const runMock = vi.fn().mockResolvedValue({ success: true });
    const bindMock = vi.fn().mockReturnValue({ first: firstMock, run: runMock });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

    const fakeEnv = {
      DB: { prepare: prepareMock },
    } as unknown as Env;

    const updated = await updateWorkspaceBranding(fakeEnv, "ws-1", "user-owner", {
      brandName: "Luxury Design Lab",
      contactPhone: "0988776655",
      watermarkText: "© LUXURY DESIGN LAB 2026",
    });

    expect(updated.brandName).toBe("Luxury Design Lab");
    expect(updated.contactPhone).toBe("0988776655");
    expect(updated.watermarkText).toBe("© LUXURY DESIGN LAB 2026");
    expect(recordWorkspaceAuditLog).toHaveBeenCalled();
  });
});

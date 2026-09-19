// White-Label Studio Branding & Watermark Types (Sprint 9 - Ticket 9.3)

export interface StudioBranding {
  workspaceId: string;
  brandLogoUrl?: string | null;
  brandName?: string | null;
  brandTagline?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactAddress?: string | null;
  watermarkEnabled: boolean;
  watermarkText?: string | null;
  watermarkPosition: "bottom-right" | "bottom-left" | "center";
  watermarkOpacity?: number; // 0.1 to 1.0 (default 0.4)
}

export interface UpdateBrandingInput {
  brandLogoUrl?: string | null;
  brandName?: string | null;
  brandTagline?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactAddress?: string | null;
  watermarkEnabled?: boolean;
  watermarkText?: string | null;
  watermarkPosition?: "bottom-right" | "bottom-left" | "center";
  watermarkOpacity?: number;
}

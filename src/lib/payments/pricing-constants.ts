// Single Source of Truth for HomeDesign Credit Packages & Pricing
// Aligns Landing Page, Pricing Section, Catalog, Stripe (USD), and SePay (VND).

export interface UnifiedPricingTier {
  id: "lite" | "plus" | "pro" | "max";
  name: string;
  nameVi: string;
  credits: number;
  usdPriceFormatted: string;
  usdAmountCents: number;
  vndPriceFormatted: string;
  vndAmount: number;
  expiryNotice: string;
  expiryNoticeVi: string;
  description: string;
  descriptionVi: string;
  badge?: string;
  features: string[];
  featuresVi: string[];
}

export const UNIFIED_PRICING_TIERS: Record<"lite" | "plus" | "pro" | "max", UnifiedPricingTier> = {
  lite: {
    id: "lite",
    name: "Lite Pack",
    nameVi: "Gói Lite (80 Credits)",
    credits: 80,
    usdPriceFormatted: "$5",
    usdAmountCents: 500, // $5.00
    vndPriceFormatted: "200.000₫",
    vndAmount: 200_000,
    expiryNotice: "Never expire",
    expiryNoticeVi: "Không giới hạn thời gian",
    description: "For testing one or two room designs",
    descriptionVi: "80 credits thiết kế phòng chất lượng cao",
    features: [
      "80 credits",
      "Không giới hạn thời gian (Never expire)",
      "Instant activation",
    ],
    featuresVi: [
      "80 credits",
      "Không giới hạn thời gian (Never expire)",
      "Kích hoạt tức thì",
    ],
  },
  plus: {
    id: "plus",
    name: "Plus Pack",
    nameVi: "Gói Plus (160 Credits)",
    credits: 160,
    usdPriceFormatted: "$9",
    usdAmountCents: 900, // $9.00
    vndPriceFormatted: "400.000₫",
    vndAmount: 400_000,
    expiryNotice: "Never expire",
    expiryNoticeVi: "Không giới hạn thời gian",
    description: "For one complete home project",
    descriptionVi: "160 credits thiết kế mặt bằng và chỉnh sửa chi tiết",
    features: [
      "160 credits",
      "10% bonus value",
      "Không giới hạn thời gian (Never expire)",
      "Sufficient for a typical 7-room home",
    ],
    featuresVi: [
      "160 credits",
      "10% giá trị cộng thêm",
      "Không giới hạn thời gian (Never expire)",
      "Đủ cho một căn hộ tiêu chuẩn 7 phòng",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro Pack",
    nameVi: "Gói Pro (320 Credits)",
    credits: 320,
    usdPriceFormatted: "$17",
    usdAmountCents: 1700, // $17.00
    vndPriceFormatted: "700.000₫",
    vndAmount: 700_000,
    expiryNotice: "Never expire",
    expiryNoticeVi: "Không giới hạn thời gian",
    description: "For multiple styles, revisions, and rooms",
    descriptionVi: "320 credits phong cách nhà ở toàn diện và panorama 360",
    badge: "Popular",
    features: [
      "320 credits",
      "15% bonus value",
      "Không giới hạn thời gian (Never expire)",
      "Great for comparing design directions",
    ],
    featuresVi: [
      "320 credits",
      "15% giá trị cộng thêm",
      "Không giới hạn thời gian (Never expire)",
      "Lý tưởng để so sánh nhiều phong cách",
    ],
  },
  max: {
    id: "max",
    name: "Max Pack",
    nameVi: "Gói Max (640 Credits)",
    credits: 640,
    usdPriceFormatted: "$32",
    usdAmountCents: 3200, // $32.00
    vndPriceFormatted: "1.200.000₫",
    vndAmount: 1_200_000,
    expiryNotice: "Never expire",
    expiryNoticeVi: "Không giới hạn thời gian",
    description: "For multiple homes or larger estates",
    descriptionVi: "640 credits chuyên nghiệp cho môi giới BĐS và thiết kế",
    badge: "Best Value",
    features: [
      "640 credits",
      "20% bonus value",
      "Không giới hạn thời gian (Never expire)",
      "Best value for realtors and studios",
    ],
    featuresVi: [
      "640 credits",
      "20% giá trị cộng thêm",
      "Không giới hạn thời gian (Never expire)",
      "Tối ưu chi phí cho môi giới & văn phòng thiết kế",
    ],
  },
};

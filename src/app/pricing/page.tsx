import type { Metadata } from "next";
import { PricingSection } from "@/components/landing/pricing-section";

export const metadata: Metadata = {
  title: "Pricing & Plans | HomeDesign AI",
  description:
    "Choose the right credit package for AI interior design, exterior redesign, and floor plan conversions. Transparent pricing, no monthly lock-in.",
};

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-background pt-16 md:pt-20">
      <PricingSection />
    </main>
  );
}

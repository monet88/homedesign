import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | HomeDesign AI",
  description: "Read the Terms of Service governing your use of HomeDesign AI architectural and interior design tools.",
};

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-background pt-24 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl rounded-2xl border border-border bg-card p-8 sm:p-12 shadow-sm">
        <div className="mb-8 border-b border-border pb-6">
          <Link href="/" className="text-xs font-semibold text-brand-primary hover:underline">
            ← Back to Home
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-foreground/60">
            Last updated: September 16, 2026
          </p>
        </div>

        <div className="space-y-6 text-sm leading-relaxed text-foreground/85">
          <section>
            <h2 className="text-lg font-bold text-foreground">1. Acceptance of Terms</h2>
            <p className="mt-2">
              By accessing or using HomeDesign AI (design.7app.online), you agree to be bound by these Terms of Service. If you do not agree, please do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">2. Credit Model & Purchases</h2>
            <p className="mt-2">
              HomeDesign operates on a pay-as-you-go credit system. Credits purchased through VietQR (SePay) or authorized card payment providers are non-refundable once consumed for AI image generation, floor plan conversion, or 360° panoramas. Unused credits remain valid in your account according to your package validity window.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">3. Intellectual Property & Commercial Use</h2>
            <p className="mt-2">
              You retain ownership of your original uploaded photos. Subject to your compliance with these Terms, you are granted full commercial rights to use the AI-generated renders for real estate staging, architectural mockups, client presentations, and marketing.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">4. Acceptable Use Policy</h2>
            <p className="mt-2">
              You agree not to upload abusive, unlawful, or sexually explicit content, or use automated bots to overwhelm our serverless generation queues. We reserve the right to suspend accounts violating these standards.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">5. Limitation of Liability</h2>
            <p className="mt-2">
              HomeDesign AI generates architectural visualizations for concept and aesthetic exploration. AI renders should not be used as certified structural blueprints or engineering calculations without independent professional review.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

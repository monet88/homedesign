import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | HomeDesign AI",
  description: "Learn how HomeDesign AI collects, protects, and uses your personal data and uploaded room images.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-background pt-24 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl rounded-2xl border border-border bg-card p-8 sm:p-12 shadow-sm">
        <div className="mb-8 border-b border-border pb-6">
          <Link href="/" className="text-xs font-semibold text-brand-primary hover:underline">
            ← Back to Home
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-foreground/60">
            Last updated: September 16, 2026
          </p>
        </div>

        <div className="space-y-6 text-sm leading-relaxed text-foreground/85">
          <section>
            <h2 className="text-lg font-bold text-foreground">1. Information We Collect</h2>
            <p className="mt-2">
              We collect information you provide directly to us when creating an account, uploading room images, generating architectural designs, or purchasing credit packs. This includes your email address, profile name, and source imagery.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">2. Image Processing & AI Model Usage</h2>
            <p className="mt-2">
              Images you upload are stored securely in encrypted Cloudflare R2 object storage. Uploaded images and generated renders are processed strictly for the purpose of fulfilling your design generation requests. We do not sell your personal images to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">3. Payment & Financial Data</h2>
            <p className="mt-2">
              Payment processing is handled through secure authorized gateways (VietQR / SePay, Stripe). HomeDesign does not store sensitive credit card numbers or banking passwords on our servers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">4. Cookies & Authentication</h2>
            <p className="mt-2">
              We use secure, HTTP-only session cookies to authenticate your user session and preserve your design history and credit balance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">5. Contact Us</h2>
            <p className="mt-2">
              If you have any questions or wish to request data deletion, please contact us at{" "}
              <a href="mailto:support@7app.online" className="text-brand-primary underline">
                support@7app.online
              </a>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

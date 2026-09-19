import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { GoogleOneTapPrompt } from "@/components/auth/google-one-tap";
import { ReferralTracker } from "@/components/referral/referral-tracker";
import { ShellWrapper } from "@/components/shell";
import { LanguageProvider } from "@/lib/i18n/context";
import { WorkspaceProvider } from "@/components/workspaces/workspace-context";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#090d13" },
  ],
};

export const metadata: Metadata = {
  title: "AI Home Design: Interior, Exterior & Floor Plan | HomeDesign",
  description:
    "Design your home with AI in one place. Redesign interiors from a photo, visualize exteriors before renovation, and turn floor plans into 2D layouts, 3D renders, and 360° walkthroughs.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-96x96.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "HomeDesign",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = localStorage.getItem('hd_theme');
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                  document.documentElement.setAttribute('data-theme', 'dark');
                } else {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.setAttribute('data-theme', 'light');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased selection:bg-amber-500/30 selection:text-amber-800 transition-colors">
        <LanguageProvider>
          <WorkspaceProvider>
            <GoogleOneTapPrompt />
            <ReferralTracker />
            <ShellWrapper>{children}</ShellWrapper>
          </WorkspaceProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}

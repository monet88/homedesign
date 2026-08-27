import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { GoogleOneTapPrompt } from "@/components/auth/google-one-tap";
import { Header, Footer } from "@/components/shell";
import "./globals.css";

// DESIGN.md: inter (400-700) + jetbrains_mono, loaded via next/font.
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

export const metadata: Metadata = {
  title: "HomeDesign Clone",
  description:
    "Explore interior, exterior, and floor-plan ideas with AI. Free-first HomeDesign clone (spec #13).",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="flex min-h-screen flex-col bg-paper text-ink antialiased">
        <GoogleOneTapPrompt />
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { GoogleOneTapPrompt } from "@/components/auth/google-one-tap";
import { ShellWrapper } from "@/components/shell";
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

export const metadata: Metadata = {
  title: "AI Home Design: Interior, Exterior & Floor Plan | HomeDesign",
  description:
    "Design your home with AI in one place. Redesign interiors from a photo, visualize exteriors before renovation, and turn floor plans into 2D layouts, 3D renders, and 360° walkthroughs.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-96x96.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <GoogleOneTapPrompt />
        <ShellWrapper>{children}</ShellWrapper>
      </body>
    </html>
  );
}


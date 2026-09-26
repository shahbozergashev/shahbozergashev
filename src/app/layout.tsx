import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // Link previews need absolute image URLs; Netlify sets URL to the site's address at build time.
  metadataBase: new URL(process.env.URL || "http://localhost:3000"),
  title: "Ask Shaha — AI clone of Shaha Dolimov",
  description:
    "Unofficial AI clone of Shaha Dolimov, founder of Meraki Marketing Agency, grounded in his public Telegram posts, YouTube videos and interviews.",
  manifest: "/manifest.json",
  // The preview image, tab icon and Apple icon come from the image files in this folder.
  openGraph: {
    type: "website",
    siteName: "Ask Shaha",
    locale: "uz_UZ",
    title: "Ask Shaha — Shaha Dolimovning AI kloni",
    description:
      "Shaha Dolimovning Telegram postlari va YouTube videolari asosida yaratilgan norasmiy AI klon. Marketing, biznes va shaxsiy rivojlanish haqida savol bering.",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <body>{children}</body>
    </html>
  );
}

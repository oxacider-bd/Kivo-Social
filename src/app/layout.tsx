import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "KIVO — Social, but cleaner.",
  description:
    "KIVO is a fast, modern social space. Share moments, join Spaces, and keep your conversations clean.",
  keywords: ["KIVO", "social", "community", "spaces", "moments"],
  applicationName: "KIVO",
  openGraph: {
    title: "KIVO — Social, but cleaner.",
    description: "A fast, modern social space. Share moments, join Spaces, stay close.",
    siteName: "KIVO",
    type: "website",
    images: [{ url: "/brand/kivo-mark.png", width: 512, height: 512, alt: "KIVO" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1917" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Archivo, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

const body = Archivo({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const mono = Spline_Sans_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Content Studio",
  description:
    "Your Idea. On-Brand Creativity. Automated Production.",
};

export const viewport: Viewport = {
  themeColor: "#f3f2ef",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${body.variable} ${mono.variable} h-full`}>
      <body className="relative min-h-full antialiased">{children}</body>
    </html>
  );
}

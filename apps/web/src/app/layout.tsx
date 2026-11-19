import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Content Studio",
  description:
    "Your Idea. On-Brand Creativity. Automated Production.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${body.variable} h-full`}>
      <body className="relative min-h-full antialiased">{children}</body>
    </html>
  );
}

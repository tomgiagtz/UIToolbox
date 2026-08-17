import type { Metadata } from "next";
import { bodyFont, displayFont } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "UIToolbox",
  description: "Browser-based tools for game developers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The two font variables are declared here and consumed by `globals.css`,
    // so a component reaches for `font-body` / `font-display` rather than for a
    // family name (#99).
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      {/* Full-height flex shell; each page supplies its own AppBar + scroll
          region so tool pages can fill the viewport edge-to-edge. */}
      <body className="flex h-screen flex-col overflow-hidden antialiased">
        {children}
      </body>
    </html>
  );
}

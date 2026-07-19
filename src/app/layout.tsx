import type { Metadata } from "next";
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
    <html lang="en">
      {/* Full-height flex shell; each page supplies its own AppBar + scroll
          region so tool pages can fill the viewport edge-to-edge. */}
      <body className="flex h-screen flex-col overflow-hidden antialiased">
        {children}
      </body>
    </html>
  );
}

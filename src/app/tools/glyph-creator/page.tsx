import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Input Glyph Creator — UIToolbox",
  description:
    "Turn a font and a list of controls into engine-ready sprite atlases of input prompts.",
};

export default function GlyphCreatorPage() {
  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to UIToolbox
        </Link>
      </nav>

      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">
          Input Glyph Creator
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Upload a font, style a background, pick your devices and inputs, and
          generate power-of-two sprite atlases with TexturePacker metadata — all
          in your browser.
        </p>
      </div>

      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        <p className="font-medium">Coming soon</p>
        <p className="text-sm">
          This tool is under construction. The generator is on its way.
        </p>
      </div>
    </div>
  );
}

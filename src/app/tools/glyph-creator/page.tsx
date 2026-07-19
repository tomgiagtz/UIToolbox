import Link from "next/link";
import type { Metadata } from "next";
import { AppBar } from "@/components/app-bar";
import { GlyphCreator } from "./glyph-creator";

export const metadata: Metadata = {
  title: "Input Glyph Creator — UIToolbox",
  description:
    "Turn a font and a list of controls into engine-ready sprite atlases of input prompts.",
};

export default function GlyphCreatorPage() {
  return (
    <>
      <AppBar
        left={
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Back to UIToolbox
          </Link>
        }
        center={
          <h1 className="text-base font-bold tracking-tight">
            Input Glyph Creator
          </h1>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        <GlyphCreator />
      </div>
    </>
  );
}

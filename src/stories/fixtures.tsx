import { useEffect, useState } from "react";
import type { PreviewGlyph } from "@/components/glyph/atlas-preview";
import { DEFAULT_STYLE, createDefaultProject } from "@/lib/glyph/defaults";
import { loadDefaultFont } from "@/lib/glyph/font";
import type { Project } from "@/lib/glyph/types";

/**
 * Fixtures shared by the stories.
 *
 * Lives outside `src/app/` and `src/components/` because both borrow from it,
 * and a component reaching into the app tree for a fixture would be the wrong
 * direction.
 *
 * Everything here is built from the same factories the app and the Vitest suites
 * use — `createDefaultProject`, `DEFAULT_STYLE` — rather than hand-written
 * literals, so a story can't quietly go on describing a shape the project no
 * longer has.
 */

/** A fresh project: the Keyboard Device, default style, default naming. */
export const storyProject: Project = createDefaultProject();

/** Preview Glyphs for the atlas stories, all on the Project-tier style. */
export function glyphsOf(labels: string[]): PreviewGlyph[] {
  return labels.map((label) => ({ label, style: DEFAULT_STYLE }));
}

/**
 * Register the bundled default face before drawing.
 *
 * The canvas previews don't register fonts themselves — `GlyphCreator` does it
 * once for the whole editor — so a story that skipped this would draw every
 * label in the canvas fallback and misreport how the Glyph actually looks.
 * Children are held back until the face lands, since the draw is an effect that
 * fires before `document.fonts.load` can resolve a family nothing registered.
 */
export function WithGlyphFont({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    loadDefaultFont().finally(() => setReady(true));
  }, []);
  return ready ? <>{children}</> : null;
}

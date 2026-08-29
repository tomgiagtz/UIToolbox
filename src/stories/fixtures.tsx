import { useEffect, useState } from "react";
import type { PreviewGlyph } from "@/components/glyph/atlas-preview";
import { DEFAULT_STYLE, createDefaultProject } from "@/lib/glyph/defaults";
import { loadDefaultFont } from "@/lib/glyph/font";
import { putImage } from "@/lib/glyph/images";
import type { ImageAsset, Project, SymbolSet } from "@/lib/glyph/types";

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

/**
 * Two uploaded images, manifest entries **and** bytes.
 *
 * An `ImageAsset` is only half an upload: the manifest entry lives in the
 * project config, the bytes in the runtime registry, and a story carrying only
 * the first would draw the missing-art placeholder in every tile — which is a
 * real state worth a story of its own, but not the one an Assets story is for.
 * So the blobs are registered on import, the way an upload registers them.
 *
 * SVG rather than a decoded raster: it needs no `createImageBitmap`, and the two
 * differ by colour so a grid shows them apart.
 */
export const storyImages: ImageAsset[] = [
  { id: "metal-a1b2.png", fileName: "metal.png", type: "image/png" },
  { id: "paper-c3d4.png", fileName: "paper.png", type: "image/png" },
];

const STORY_IMAGE_SVGS = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#64748b"/><path d="M6 22 13 12l5 6 4-4 4 8Z" fill="#e2e8f0"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#f8fafc" stroke="#94a3b8" stroke-width="2"/><path d="M9 11h14M9 16h14M9 21h9" stroke="#64748b" stroke-width="2" stroke-linecap="round"/></svg>',
];

storyImages.forEach((image, i) => {
  putImage(
    image.id,
    new Blob([STORY_IMAGE_SVGS[i]], { type: "image/svg+xml" }),
  );
});

/**
 * An imported **Symbol Set**, as `acceptReview` would have produced one (#39).
 *
 * Painted in the Paint Role sentinels, exactly as an authored file is — the
 * stories recolour it through the Set's own preview palette, which is the whole
 * point of that palette existing (ADR-0015 §3). One cell carries an off-primary
 * red so the flagged-paint path has something to show.
 */
export const storySet: SymbolSet = {
  id: "set-mypad-x1",
  name: "mypad.svg",
  roleColors: { fill: "#2f9e44", border: "#111111", secondary: "#ffffff" },
  cells: [
    {
      id: "a",
      label: "Jump",
      labelEdited: true,
      col: 0,
      row: 0,
      roles: ["fill", "border"],
      flags: [],
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><circle cx="128" cy="128" r="92" style="fill:#f00;stroke:#00f;stroke-width:12"/></svg>',
    },
    {
      id: "paddle-left",
      label: "Paddle Left",
      labelEdited: false,
      col: 1,
      row: 0,
      roles: ["fill", "border"],
      flags: [],
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="256 0 256 256"><polygon points="326,50 442,108 326,206" style="fill:#f00;stroke:#00f;stroke-width:12"/></svg>',
    },
    {
      id: "paddle-right",
      label: "Paddle Right",
      labelEdited: false,
      col: 0,
      row: 1,
      roles: ["border"],
      flags: [{ shape: "polygon", prop: "fill", value: "#fe0000" }],
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 256 256 256"><polygon points="186,306 70,364 186,462" style="fill:#fe0000;stroke:#00f;stroke-width:12"/></svg>',
    },
  ],
};

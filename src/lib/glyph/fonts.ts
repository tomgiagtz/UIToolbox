/**
 * The project's font manifest (ADR-0012 §6, §7).
 *
 * An uploaded font is split the way a custom image is: the {@link FontAsset}
 * manifest entry lives in the project config, while the bytes live in IndexedDB
 * and travel in the project ZIP. Unlike an image there is no runtime byte
 * registry, because a font's bytes are consumed once — `registerFont` hands
 * them to a {@link FontFace} and the draw path then reaches the face through
 * `document.fonts`, keyed by family.
 *
 * This module owns the two things the manifest needs and the draw path doesn't:
 * minting a unique ZIP entry name at upload, and assembling the pickable set.
 */
import { BUNDLED_FONTS, getBundledFont } from "@/lib/glyph/bundled-fonts";
import type { WeightAxis } from "@/lib/glyph/font-axes";
import type { FontAsset, Project } from "@/lib/glyph/types";

/**
 * A font family the user can pick, and where it came from.
 *
 * The two sources differ in exactly one way that matters to a picker — an
 * uploaded family's name (`UITBFont-1770000000-a1b2c3`) is machine-minted and
 * unreadable, so the picker shows its filename instead — so the distinction is
 * carried rather than re-derived at each call site.
 */
export interface PickableFont {
  family: string;
  /** What to show: the family for a bundled face, the filename for an upload. */
  label: string;
  bundled: boolean;
}

/**
 * Mint the ZIP entry name for a newly uploaded font: `fileName`, suffixed if
 * the manifest already carries it (`Regular.woff2` → `Regular-2.woff2`).
 *
 * Minted at **upload** rather than at export so the manifest field is the entry
 * name verbatim — no export-time renaming, and no import-time re-derivation
 * that could disagree with the manifest. The original extension is preserved so
 * anyone unzipping a project by hand gets a file their OS recognises.
 */
export function nextFontFileName(fonts: FontAsset[], fileName: string): string {
  const taken = new Set(fonts.map((f) => f.fileName));
  if (!taken.has(fileName)) return fileName;

  const dot = fileName.lastIndexOf(".");
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : "";
  let n = 2;
  while (taken.has(`${stem}-${n}${ext}`)) n++;
  return `${stem}-${n}${ext}`;
}

/**
 * The manifest entry for a newly uploaded font. `family` comes from
 * `loadFontFromFile`, which has already registered the face under it.
 */
export function fontAssetFor(
  fonts: FontAsset[],
  family: string,
  fileName: string,
): FontAsset {
  return { family, fileName: nextFontFileName(fonts, fileName) };
}

/**
 * Every family this project can draw in: the bundled set, then its uploads.
 *
 * Assembled here at render time and never stored — writing the bundled families
 * into `project.fonts` would put the shipped set in two places (ADR-0012 §6).
 */
export function pickableFonts(project: Project): PickableFont[] {
  return [
    ...BUNDLED_FONTS.map((font) => ({
      family: font.family,
      label: font.family,
      bundled: true,
    })),
    ...project.fonts.map((asset) => ({
      family: asset.family,
      label: asset.fileName,
      bundled: false,
    })),
  ];
}

/**
 * The weight to draw `family` at when the user has just picked it.
 *
 * A bundled family brings its own: the weight it stays legible at under
 * `drawLabel`'s shrink, which is not the same number for every face (#76). An
 * upload has no such judgement behind it, so it takes whatever its file calls
 * default — which for a static font is its only weight. The final fallback is
 * CSS `normal`, for a face registered before its axis could be read.
 *
 * Applied on *picking* a family rather than at resolve time, so the value the
 * cascade holds is always the one the user can see in the control.
 */
export function defaultWeightFor(
  family: string,
  axis: WeightAxis | undefined,
): number {
  return getBundledFont(family)?.defaultWeight ?? axis?.default ?? 400;
}

/**
 * Every family named anywhere in `project` — its base style and every Device
 * and Glyph override.
 *
 * A superset of what will actually be drawn (an override on a disabled Input
 * still counts), which is the right side to err on: this drives *loading*, and
 * a family loaded needlessly costs one request while a family missing at draw
 * time costs a silently wrong face.
 */
export function familiesInUse(project: Project): string[] {
  const families = new Set([project.style.foreground.fontFamily]);
  for (const device of project.devices) {
    const overrides = [device.style, ...Object.values(device.glyphStyles)];
    for (const override of overrides) {
      const family = override.foreground?.fontFamily;
      if (family !== undefined) families.add(family);
    }
  }
  return [...families];
}

/**
 * Whether `family` is one this project knows about — bundled or uploaded.
 *
 * The membership test behind `repairFontFamilies`: a family in neither set has
 * no bytes and no shipped file, so nothing can draw it.
 */
export function isKnownFamily(project: Project, family: string): boolean {
  return (
    BUNDLED_FONTS.some((f) => f.family === family) ||
    project.fonts.some((f) => f.family === family)
  );
}

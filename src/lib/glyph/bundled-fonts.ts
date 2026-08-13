/**
 * The font families that ship with the tool (#76).
 *
 * A **leaf module with no imports**, deliberately: ADR-0012 §5's Preset build
 * gate has to reject "a font family not in the bundled registry" from a bare
 * Node script with no bundler, so it can only import a module that needs no
 * alias resolution — the same property that lets it import `catalog.ts`.
 * {@link DEFAULT_FONT_FAMILY} lives here rather than in `defaults.ts` for that
 * reason, and `defaults.ts` re-exports it so importers don't have to care.
 *
 * Bundled families are **code**, exactly as `DEVICE_CATALOGS` and the Symbol
 * registry are. They are never written into `project.fonts`, which manifests
 * uploads alone: listing them would put the shipped set in two places, drifting
 * the moment a font is added or dropped and leaving old saves asserting
 * families that no longer exist (ADR-0012 §6).
 */

/** One shipped family and the file it is registered from. */
export interface BundledFont {
  /**
   * The registered FontFace family — what a resolved style's `fontFamily`
   * holds, and what the picker shows. There is no separate label: the family
   * *is* the label, so showing anything else would show the user a name their
   * project data doesn't contain.
   */
  family: string;
  /**
   * Filename under `public/fonts/`, kept **verbatim from upstream** and
   * therefore not derivable from {@link family} (`JetBrainsMono-Medium.ttf`
   * pairs with `"JetBrains Mono"`). The name is the only clue to which
   * *instance* a file is, and the model has no weight axis to recover it from,
   * so the pairing is carried as data rather than guessed (#76).
   */
  file: string;
  /**
   * Weight this family is drawn at until the user says otherwise.
   *
   * Carried per row because the legible weight is a property of the face, not a
   * constant: at the two-to-five characters and heavy shrink `drawLabel` puts a
   * label through, Source Serif needs SemiBold to hold up where Inter is
   * already sturdy at Regular (#76).
   *
   * The **available** weights are not here — they are read from the file's
   * `fvar` table at registration (`font-axes.ts`), so a row can't claim a range
   * its bytes don't have. A static face simply has this one.
   */
  defaultWeight: number;
}

/**
 * The shipped set: one face per style category — sans, mono, serif,
 * handwritten, display — all OFL 1.1 (#76).
 *
 * **Order is meaningful.** It is the picker's order, the way the Symbol Set
 * manifest's array order is, and row 0 is the default every fresh project
 * starts on.
 *
 * The first three ship as **variable** files, so their weight is a control
 * rather than a decision made here; the last two have exactly one weight
 * upstream and so decide themselves. #76 chose static cuts to keep a variable
 * file from silently rendering at 400 — registering the real axis
 * (`registerFont`) fixes that properly and makes the weight adjustable, which
 * a frozen cut could never be.
 */
export const BUNDLED_FONTS: readonly BundledFont[] = [
  { family: "Inter", file: "InterVariable.ttf", defaultWeight: 400 },
  {
    family: "JetBrains Mono",
    file: "JetBrainsMono[wght].ttf",
    defaultWeight: 500,
  },
  {
    family: "Source Serif 4",
    file: "SourceSerif4Variable-Roman.ttf",
    defaultWeight: 600,
  },
  {
    family: "Patrick Hand",
    file: "PatrickHand-Regular.ttf",
    defaultWeight: 400,
  },
  { family: "Titan One", file: "TitanOne-Regular.ttf", defaultWeight: 400 },
];

/**
 * Family a fresh project renders in, with no upload required.
 *
 * Defined *from* the first row rather than repeated, so "the default is a
 * member of the bundled set" is unbreakable rather than merely tested.
 */
export const DEFAULT_FONT_FAMILY = BUNDLED_FONTS[0].family;

/** Weight a fresh project draws in — the default family's own (#76). */
export const DEFAULT_FONT_WEIGHT = BUNDLED_FONTS[0].defaultWeight;

/** The shipped row for `family`, or `undefined` if it isn't a bundled one. */
export function getBundledFont(family: string): BundledFont | undefined {
  return BUNDLED_FONTS.find((f) => f.family === family);
}

/** Public URL the family's file is served from. */
export function bundledFontUrl(font: BundledFont): string {
  return `/fonts/${font.file}`;
}

/**
 * Filename of the licence shipped beside a font, on the existing
 * `Inter-LICENSE.txt` pattern.
 *
 * Derived from the family with its spaces closed up rather than from the file,
 * because the file names an *instance* and a licence covers the family — and
 * because upstream filenames are kept verbatim, so they are not a stable stem
 * to build on (`JetBrainsMono[wght].ttf`, `SourceSerif4Variable-Roman.ttf`).
 */
export function bundledLicenseFile(font: BundledFont): string {
  return `${font.family.replaceAll(" ", "")}-LICENSE.txt`;
}

/**
 * The three complete style pairings compared in #99, as data.
 *
 * A candidate is a **whole system** — palette, body face, type scale, spacing,
 * radius — never a palette alone. That is the ticket's premise: a hue that reads
 * well as swatches and badly in a dense control panel is the failure this
 * comparison exists to catch, so the parts are only ever judged together.
 *
 * These are **candidates, not the shipped theme**. `globals.css` is where a
 * token is true (ADR-0013 §1) and it does not read this file; the winner is
 * hand-carried into `:root` by #101. What this module exists for is to give the
 * contrast gate something to measure and to record what was compared.
 *
 * Colors are OKLCH strings in the same form `globals.css` uses, so a value can
 * be moved between the two by copy rather than by conversion — a conversion step
 * is a place for a palette to silently drift from the one that was reviewed.
 */

/** One step of a type scale. Sizes and line heights are px. */
export interface TypeStep {
  size: number;
  /**
   * Explicit, always. Every text style in the Figma file is `lineHeight: AUTO`,
   * and ADR-0013 §6 calls that half a type scale — the renderer's guess is not
   * a decision anyone made or reviewed.
   */
  lineHeight: number;
  family: "display" | "body";
  weight: number;
}

export interface Candidate {
  id: "a" | "b" | "c" | "d";
  /** Short name used in the Figma frame heading and in the issue write-up. */
  name: string;
  /**
   * The body face. Display is Cal Sans in every candidate — ADR-0013 §6 keeps
   * it, so it is not one of the things being varied here.
   */
  bodyFace: string;
  /** Why this pairing is worth looking at, in one line. */
  rationale: string;
  /** Semantic role → OKLCH. Keys match the custom properties in `globals.css`. */
  color: Record<string, string>;
  type: Record<string, TypeStep>;
  /** Named steps on a 4px grid, px. */
  spacing: Record<string, number>;
  /**
   * Explicit steps, px — not `calc(var(--radius) ± Npx)`. A Figma variable
   * cannot hold a `calc()`, so a derived step is a token that exists only in
   * code and can never be reviewed where ADR-0013 §1 says the look is decided.
   */
  radius: Record<string, number>;
}

/**
 * Shared across all three, so the comparison stays about the hue and the face.
 *
 * `--destructive` is the one color the app already had chroma in, and it is not
 * what this ticket is choosing. The Glyph-domain tokens (`--input-fill-*`,
 * `--glyph-highlight-*`) are out of scope entirely: they style the *user's*
 * Glyphs, and ADR-0013 keeps the two vocabularies apart.
 */
const SHARED_COLOR = {
  destructive: "oklch(0.704 0.191 22.216)",
} as const;

const SPACING_4PX = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
} as const;

/**
 * The lightness ladder every candidate walks, so only chroma and hue differ.
 * Seeded from #98's primitives, which took Tailwind's neutral steps.
 */
const L = {
  950: 0.145,
  900: 0.205,
  800: 0.269,
  500: 0.556,
  400: 0.708,
  200: 0.922,
  50: 0.985,
} as const;

/** Build a candidate's neutral ramp at one chroma and hue. */
function ramp(chroma: number, hue: number) {
  const at = (l: number) =>
    chroma === 0 ? `oklch(${l} 0 0)` : `oklch(${l} ${chroma} ${hue})`;
  return {
    "surface-base": at(L[950]),
    "surface-raised": at(L[900]),
    "surface-overlay": at(L[900]),
    "surface-sunken": at(L[800]),
    "surface-hover": at(L[800]),
    "surface-raised-foreground": at(L[50]),
    "surface-overlay-foreground": at(L[50]),
    "surface-hover-foreground": at(L[50]),
    foreground: at(L[50]),
    "muted-foreground": at(L[400]),
    primary: at(L[200]),
    "primary-foreground": at(L[900]),
    secondary: at(L[800]),
    "secondary-foreground": at(L[50]),
  };
}

export const CANDIDATES: readonly Candidate[] = [
  {
    id: "a",
    name: "Graphite Teal",
    bodyFace: "Inter",
    rationale:
      "A cool ramp reads as a tool rather than a document, and teal is the " +
      "one family least likely to collide with a controller brand palette — " +
      "the pads are red, blue, green and black.",
    color: {
      ...ramp(0.008, 250),
      ...SHARED_COLOR,
      accent: "oklch(0.72 0.12 200)",
      "accent-foreground": "oklch(0.145 0.008 250)",
      border: "oklch(1 0 0 / 10%)",
      input: "oklch(1 0 0 / 15%)",
      ring: "oklch(0.72 0.12 200)",
    },
    type: {
      h1: { size: 36, lineHeight: 40, family: "display", weight: 400 },
      h2: { size: 24, lineHeight: 30, family: "display", weight: 400 },
      h3: { size: 20, lineHeight: 26, family: "display", weight: 400 },
      body: { size: 14, lineHeight: 20, family: "body", weight: 400 },
      small: { size: 12, lineHeight: 16, family: "body", weight: 400 },
    },
    spacing: { ...SPACING_4PX },
    radius: { sm: 4, md: 6, lg: 8, xl: 12 },
  },
  {
    id: "b",
    name: "Umber Amber",
    bodyFace: "Public Sans",
    rationale:
      "A warm ramp and a tighter radius make the rail read as denser and more " +
      "workmanlike; amber is the accent that survives sitting beside saturated " +
      "art because it is the one the art rarely uses.",
    color: {
      ...ramp(0.008, 80),
      ...SHARED_COLOR,
      accent: "oklch(0.78 0.13 75)",
      "accent-foreground": "oklch(0.145 0.008 80)",
      border: "oklch(1 0 0 / 10%)",
      input: "oklch(1 0 0 / 15%)",
      ring: "oklch(0.78 0.13 75)",
    },
    type: {
      h1: { size: 36, lineHeight: 40, family: "display", weight: 400 },
      h2: { size: 24, lineHeight: 30, family: "display", weight: 400 },
      h3: { size: 20, lineHeight: 26, family: "display", weight: 400 },
      body: { size: 14, lineHeight: 20, family: "body", weight: 400 },
      small: { size: 12, lineHeight: 16, family: "body", weight: 400 },
    },
    spacing: { ...SPACING_4PX },
    radius: { sm: 2, md: 4, lg: 6, xl: 8 },
  },
  {
    id: "c",
    name: "Neutral Violet",
    bodyFace: "Geist",
    rationale:
      "Keeps #98's true-neutral ramp untouched and spends the entire color " +
      "budget on the accent — the most restrained option, and the one that " +
      "competes least with whatever the user's atlas contains.",
    color: {
      ...ramp(0, 0),
      ...SHARED_COLOR,
      // Lightened from 0.66 to 0.70 and flipped to a dark foreground: at 0.66
      // the pair measured 3.16:1 against white, which the gate rejected. Every
      // candidate's accent ends up light-on-dark-text for the same reason —
      // a dark accent disappears into a near-black rail.
      accent: "oklch(0.7 0.16 295)",
      "accent-foreground": "oklch(0.145 0 0)",
      border: "oklch(1 0 0 / 10%)",
      input: "oklch(1 0 0 / 15%)",
      ring: "oklch(0.7 0.16 295)",
    },
    type: {
      h1: { size: 36, lineHeight: 40, family: "display", weight: 400 },
      h2: { size: 24, lineHeight: 30, family: "display", weight: 400 },
      h3: { size: 20, lineHeight: 26, family: "display", weight: 400 },
      body: { size: 14, lineHeight: 20, family: "body", weight: 400 },
      small: { size: 12, lineHeight: 16, family: "body", weight: 400 },
    },
    spacing: { ...SPACING_4PX },
    radius: { sm: 3, md: 5, lg: 6, xl: 10 },
  },
  {
    id: "d",
    name: "Violet Public",
    bodyFace: "Public Sans",
    rationale:
      "The chosen pairing, and a hybrid rather than one of the first three: " +
      "C's true-neutral ramp and violet accent with B's body face and tight " +
      "radii. Looking at all three side by side separated the hue question " +
      "from the density question, which is the thing a swatch grid could not " +
      "have shown.",
    color: {
      ...ramp(0, 0),
      ...SHARED_COLOR,
      accent: "oklch(0.7 0.16 295)",
      "accent-foreground": "oklch(0.145 0 0)",
      border: "oklch(1 0 0 / 10%)",
      input: "oklch(1 0 0 / 15%)",
      ring: "oklch(0.7 0.16 295)",
    },
    type: {
      h1: { size: 36, lineHeight: 40, family: "display", weight: 400 },
      h2: { size: 24, lineHeight: 30, family: "display", weight: 400 },
      h3: { size: 20, lineHeight: 26, family: "display", weight: 400 },
      body: { size: 14, lineHeight: 20, family: "body", weight: 400 },
      small: { size: 12, lineHeight: 16, family: "body", weight: 400 },
    },
    spacing: { ...SPACING_4PX },
    radius: { sm: 2, md: 4, lg: 6, xl: 8 },
  },
];

/**
 * The pairing that won the comparison (#99).
 *
 * Kept as an id into {@link CANDIDATES} rather than as a separate copy of the
 * values: two copies of a palette is exactly the drift ADR-0013 §1 exists to
 * prevent, and the losers stay in the file because "what was compared" is part
 * of the decision, not scaffolding to delete afterwards.
 */
export const CHOSEN_ID = "d" as const;

export const CHOSEN: Candidate = CANDIDATES.find((c) => c.id === CHOSEN_ID)!;

/**
 * The foreground/background pairings the app actually renders, as
 * `[foreground, background]` role names.
 *
 * Derived by reading the call sites rather than by enumerating the token
 * matrix: a pairing no component produces is not a pairing anyone has to pass,
 * and asserting it would block a palette for a combination that never appears.
 */
export const TEXT_PAIRS: readonly [string, string][] = [
  // The rail and the page ground.
  ["foreground", "surface-base"],
  ["muted-foreground", "surface-base"],
  // Cards and the panels stacked on the ground.
  ["surface-raised-foreground", "surface-raised"],
  ["muted-foreground", "surface-raised"],
  // Popovers and tooltips.
  ["surface-overlay-foreground", "surface-overlay"],
  ["muted-foreground", "surface-overlay"],
  // The one ADR-0013 and #99 both single out: every helper line and every
  // field description in the Editor rail is this pair.
  ["muted-foreground", "surface-sunken"],
  ["foreground", "surface-sunken"],
  // Hover states, which are a whole surface in this system rather than a tint.
  ["surface-hover-foreground", "surface-hover"],
  ["muted-foreground", "surface-hover"],
  // Buttons.
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
];

/**
 * Non-text pairings that carry meaning, so WCAG 2.1 SC 1.4.11 applies at 3:1.
 *
 * Only the focus ring is here. Borders are deliberately absent and that is a
 * finding, not an oversight: `--border` and `--input` are white at 10% and 15%
 * over a near-black ground in the *shipped* palette, which is far under 3:1
 * already. Asserting them would fail every candidate for a defect none of them
 * introduced, and quietly widening this ticket to fix it would hide it. It is
 * filed separately.
 */
export const UI_PAIRS: readonly [string, string][] = [
  ["ring", "surface-base"],
  ["ring", "surface-raised"],
  ["ring", "surface-sunken"],
];

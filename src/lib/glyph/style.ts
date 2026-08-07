/**
 * The Style Cascade (ADR-0006).
 *
 * A Glyph's visual style resolves through four tiers, lowest precedence first:
 *
 * ```
 * Project defaults → Device overrides → Catalog per-Input default → Glyph overrides
 * ```
 *
 * The Project tier is a **full** {@link GlyphStyle}; every higher tier is a
 * sparse {@link StyleOverride} that patches only the properties it sets. Anything
 * left unset falls up the chain. {@link resolveStyle} folds a base plus any
 * number of overrides into one effective {@link GlyphStyle}.
 *
 * The font is deliberately **not** part of this cascade, and neither is
 * `cellSize`: both stay Project-global (see ADR-0006). `cellSize` is an atlas
 * output value, so it lives in `project.exportSettings` (ADR-0012 §6) rather
 * than anywhere near a style.
 */
import type { Background, BackgroundSource } from "@/lib/glyph/types";

/**
 * The three **Paint Role** colours a Symbol's sentinel shapes resolve to
 * (ADR-0007): `fill` (primary ink, `#f00`), `border` (outline, `#00f`), and
 * `secondary` (highlight, `#0f0`). Independent of the label `textColor`.
 */
export interface SymbolPaints {
  fill: string;
  border: string;
  secondary: string;
}

/**
 * A Glyph's chosen **Render Source**, overriding the Catalog's default for that
 * Input (ADR-0004). `symbol` on an Input the Catalog ships no Symbol for, and
 * `image` naming an asset the project doesn't carry, both fall back to the
 * default — see `resolveRenderSource`.
 *
 * Sizing is deliberately **not** part of this union: {@link StyleOverride.contentScale}
 * scales whichever source is drawn, so switching an Input from its Symbol to its
 * label can't silently discard the sizing the user set.
 */
export type RenderSourceOverride =
  { kind: "label" } | { kind: "symbol" } | { kind: "image"; imageId: string };

/**
 * A fully-resolved Glyph style: the effective text color, Background, the Symbol
 * Paint Role colours (ADR-0007 §3), and the content scale.
 *
 * The Render Source itself is **not** here: resolving it also needs the Catalog
 * entry's Symbol and the project's image manifest, so it has its own resolver
 * (`resolveRenderSource`) over the same {@link StyleOverride} tiers.
 */
export interface GlyphStyle {
  textColor: string;
  background: Background;
  symbolPaints: SymbolPaints;
  /**
   * Multiplier on the tile's content box — the square a label, Symbol, or custom
   * image is drawn in. `1` is the default fit; above 1 the content is clipped to
   * its cell (issue #20).
   */
  contentScale: number;
}

/** A sparse patch of a {@link Background}; unset fields fall up the cascade. */
export interface BackgroundOverride {
  /**
   * Where this tier draws its tile from (issue #22). Replaced wholesale, never
   * merged — a source is one choice, so patching an `image` onto an `authored`
   * base must not leave a tile that is half of each.
   *
   * Setting it to `{ kind: "shape" }` is meaningfully different from omitting it:
   * the Catalog per-Input tier outranks the Device tier, so bumpers and triggers
   * carry a tile by default and *omitting* the field just lets that tile fall
   * through. Only an explicit "shape" turns it off, which is what makes a
   * per-Glyph shape change stick — and likewise an explicit `{ kind: "none" }`,
   * the only way to turn an inherited tile off without putting a shape back.
   */
  source?: BackgroundSource;
  /** Read only where the resolved source is `{ kind: "shape" }`. */
  shape?: Background["shape"];
  fill?: string;
  cornerRadius?: number;
  border?: Partial<Background["border"]>;
}

/**
 * A sparse override applied at the Device, Catalog per-Input, or Glyph tier.
 * An empty object (`{}`) is a no-op, which is the default state at every tier
 * above Project — so a fresh project resolves to its Project style untouched.
 */
export interface StyleOverride {
  textColor?: string;
  background?: BackgroundOverride;
  /** A sparse patch of the Symbol Paint Role colours; unset roles fall up (ADR-0007). */
  symbolPaints?: Partial<SymbolPaints>;
  /** Which Render Source this tier draws; replaces wholesale, never merged (#20). */
  renderSource?: RenderSourceOverride;
  /** Scale of whatever Render Source is drawn; see {@link GlyphStyle.contentScale}. */
  contentScale?: number;
}

/** An override that changes nothing — the default at every non-Project tier. */
export const NO_OVERRIDE: StyleOverride = {};

/**
 * Which tier of the cascade the UI is currently editing. The Project tier is the
 * base style; the Device and Glyph tiers store sparse {@link StyleOverride}s (the
 * Glyph tier keyed by Catalog id or custom id on its Device).
 */
export type StyleScope =
  | { tier: "project" }
  | { tier: "device"; deviceIndex: number }
  | { tier: "glyph"; deviceIndex: number; glyphId: string };

/**
 * One cascade-editable property, as addressed by the reset ("fall back up")
 * control. Background sub-properties are flattened so a single field names
 * exactly one setting the user can override or clear.
 */
export type StyleField =
  | "textColor"
  | "shape"
  | "fill"
  | "cornerRadius"
  | "borderWidth"
  | "borderColor"
  | "backgroundSource"
  | "symbolFill"
  | "symbolBorder"
  | "symbolSecondary"
  | "renderSource"
  | "contentScale";

/**
 * Deep-merge two sparse overrides, `patch` winning. Background and its border are
 * merged property-by-property so a patch can set just one setting without dropping
 * the rest of an existing override. Never mutates its inputs.
 */
export function mergeOverride(
  base: StyleOverride,
  patch: StyleOverride,
): StyleOverride {
  const next: StyleOverride = { ...base };
  if (patch.textColor !== undefined) next.textColor = patch.textColor;
  if (patch.background) {
    const border = { ...base.background?.border, ...patch.background.border };
    next.background = {
      ...base.background,
      ...patch.background,
      ...(Object.keys(border).length > 0 ? { border } : {}),
    };
  }
  if (patch.symbolPaints) {
    next.symbolPaints = { ...base.symbolPaints, ...patch.symbolPaints };
  }
  // A Render Source is one choice, not a bag of properties: merging an `image`
  // patch into a `label` base would leave a half-and-half override.
  if (patch.renderSource !== undefined) next.renderSource = patch.renderSource;
  if (patch.contentScale !== undefined) next.contentScale = patch.contentScale;
  return next;
}

/** Whether `field` is explicitly set on this sparse override. */
export function isOverrideFieldSet(
  override: StyleOverride,
  field: StyleField,
): boolean {
  switch (field) {
    case "textColor":
      return override.textColor !== undefined;
    case "shape":
      return override.background?.shape !== undefined;
    case "fill":
      return override.background?.fill !== undefined;
    case "cornerRadius":
      return override.background?.cornerRadius !== undefined;
    case "borderWidth":
      return override.background?.border?.width !== undefined;
    case "borderColor":
      return override.background?.border?.color !== undefined;
    case "backgroundSource":
      return override.background?.source !== undefined;
    case "symbolFill":
      return override.symbolPaints?.fill !== undefined;
    case "symbolBorder":
      return override.symbolPaints?.border !== undefined;
    case "symbolSecondary":
      return override.symbolPaints?.secondary !== undefined;
    case "renderSource":
      return override.renderSource !== undefined;
    case "contentScale":
      return override.contentScale !== undefined;
  }
}

/**
 * Return a copy of `override` with the one {@link StyleField} removed, so that
 * property falls back up the cascade again. Empty `border`/`background` objects
 * are dropped so clearing the last set property collapses the override to `{}`.
 */
export function clearOverrideField(
  override: StyleOverride,
  field: StyleField,
): StyleOverride {
  const next: StyleOverride = { ...override };
  if (field === "textColor") {
    delete next.textColor;
    return next;
  }
  if (field === "renderSource") {
    delete next.renderSource;
    return next;
  }
  if (field === "contentScale") {
    delete next.contentScale;
    return next;
  }
  if (
    field === "symbolFill" ||
    field === "symbolBorder" ||
    field === "symbolSecondary"
  ) {
    if (!next.symbolPaints) return next;
    const sp: Partial<SymbolPaints> = { ...next.symbolPaints };
    if (field === "symbolFill") delete sp.fill;
    else if (field === "symbolBorder") delete sp.border;
    else delete sp.secondary;
    if (Object.keys(sp).length > 0) next.symbolPaints = sp;
    else delete next.symbolPaints;
    return next;
  }
  if (!next.background) return next;
  const bg: BackgroundOverride = { ...next.background };
  if (field === "shape") delete bg.shape;
  else if (field === "backgroundSource") delete bg.source;
  else if (field === "fill") delete bg.fill;
  else if (field === "cornerRadius") delete bg.cornerRadius;
  else if (field === "borderWidth" || field === "borderColor") {
    if (bg.border) {
      const border = { ...bg.border };
      if (field === "borderWidth") delete border.width;
      else delete border.color;
      if (Object.keys(border).length > 0) bg.border = border;
      else delete bg.border;
    }
  }
  if (Object.keys(bg).length > 0) next.background = bg;
  else delete next.background;
  return next;
}

/**
 * Fold `base` and `overrides` (in ascending precedence) into one effective
 * {@link GlyphStyle}. Later overrides win; Background and its border are merged
 * property-by-property so a tier can set just `fill` or just the border width
 * without discarding the rest. Never mutates its inputs.
 */
export function resolveStyle(
  base: GlyphStyle,
  ...overrides: (StyleOverride | undefined)[]
): GlyphStyle {
  let textColor = base.textColor;
  let background: Background = {
    ...base.background,
    border: { ...base.background.border },
  };
  const symbolPaints: SymbolPaints = { ...base.symbolPaints };
  let contentScale = base.contentScale;

  for (const override of overrides) {
    if (!override) continue;
    if (override.textColor !== undefined) textColor = override.textColor;
    if (override.background) {
      background = applyBackground(background, override.background);
    }
    if (override.symbolPaints) {
      Object.assign(symbolPaints, override.symbolPaints);
    }
    if (override.contentScale !== undefined)
      contentScale = override.contentScale;
  }

  return { textColor, background, symbolPaints, contentScale };
}

/** Return `bg` patched with the set fields of `patch` (border merged deeply). */
function applyBackground(
  bg: Background,
  patch: BackgroundOverride,
): Background {
  const next: Background = { ...bg, border: { ...bg.border } };
  if (patch.shape !== undefined) next.shape = patch.shape;
  // One choice, replaced whole: a tier that names a source says everything about
  // where the tile comes from, including its mirror flag.
  if (patch.source !== undefined) next.source = patch.source;
  if (patch.fill !== undefined) next.fill = patch.fill;
  if (patch.cornerRadius !== undefined) next.cornerRadius = patch.cornerRadius;
  if (patch.border) {
    if (patch.border.width !== undefined)
      next.border.width = patch.border.width;
    if (patch.border.color !== undefined)
      next.border.color = patch.border.color;
  }
  return next;
}

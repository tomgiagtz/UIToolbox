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
 * `cellSize` and the font are deliberately **not** part of this cascade — they
 * stay Project-global (see ADR-0006).
 */
import type { Background } from "@/lib/glyph/types";

/** A fully-resolved Glyph style: the effective text color + Background. */
export interface GlyphStyle {
  textColor: string;
  background: Background;
}

/** A sparse patch of a {@link Background}; unset fields fall up the cascade. */
export interface BackgroundOverride {
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
  | "borderColor";

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
  if (!next.background) return next;
  const bg: BackgroundOverride = { ...next.background };
  if (field === "shape") delete bg.shape;
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

  for (const override of overrides) {
    if (!override) continue;
    if (override.textColor !== undefined) textColor = override.textColor;
    if (override.background) {
      background = applyBackground(background, override.background);
    }
  }

  return { textColor, background };
}

/** Return `bg` patched with the set fields of `patch` (border merged deeply). */
function applyBackground(
  bg: Background,
  patch: BackgroundOverride,
): Background {
  const next: Background = { ...bg, border: { ...bg.border } };
  if (patch.shape !== undefined) next.shape = patch.shape;
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

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
function applyBackground(bg: Background, patch: BackgroundOverride): Background {
  const next: Background = { ...bg, border: { ...bg.border } };
  if (patch.shape !== undefined) next.shape = patch.shape;
  if (patch.fill !== undefined) next.fill = patch.fill;
  if (patch.cornerRadius !== undefined) next.cornerRadius = patch.cornerRadius;
  if (patch.border) {
    if (patch.border.width !== undefined) next.border.width = patch.border.width;
    if (patch.border.color !== undefined) next.border.color = patch.border.color;
  }
  return next;
}

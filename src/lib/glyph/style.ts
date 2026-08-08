/**
 * The Style Cascade (ADR-0006, amended to three tiers by ADR-0012 §2).
 *
 * A Glyph's visual style resolves through three tiers, lowest precedence first:
 *
 * ```
 * Project base → Device override → Glyph override
 * ```
 *
 * The Project tier is a **full** {@link GlyphStyle}; every higher tier is a
 * sparse {@link StyleOverride} that patches only the properties it sets. Anything
 * left unset falls up the chain. {@link resolveStyle} folds a base plus any
 * number of overrides into one effective {@link GlyphStyle}.
 *
 * **What a Glyph is drawn from is per-Glyph; how it's painted cascades.** So
 * `background.source` is settable at the Project base and the Glyph tier only —
 * the Device tier is structurally unable to name one ({@link DeviceStyleOverride})
 * — while colour, shape, radius and border cascade at every tier. A Catalog's art
 * **seed** ranks between the two: see {@link resolveGlyphStyle}.
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

/**
 * The parts of a {@link Background} that describe **how a tile is painted**, as
 * opposed to what it is. Every tier may set these; unset fields fall up.
 */
export interface BackgroundPaintOverride {
  /** Read only where the resolved source is `{ kind: "shape" }`. */
  shape?: Background["shape"];
  fill?: string;
  cornerRadius?: number;
  border?: Partial<Background["border"]>;
}

/** A sparse patch of a {@link Background}; unset fields fall up the cascade. */
export interface BackgroundOverride extends BackgroundPaintOverride {
  /**
   * Where the tile is drawn from (issue #22). Replaced wholesale, never merged —
   * a source is one choice, so patching an `image` onto an `authored` base must
   * not leave a tile that is half of each.
   *
   * Settable at the Project base and the Glyph tier only (ADR-0012 §2); see
   * {@link DeviceStyleOverride} for why the Device tier is excluded.
   *
   * Setting it to `{ kind: "shape" }` is meaningfully different from omitting it,
   * and still is under the three-tier cascade: a Catalog **seed** outranks the
   * Project base, so bumpers and triggers carry a tile and *omitting* the field
   * just lets that seed through. Only an explicit "shape" turns it off, which is
   * what makes a per-Glyph shape change stick — and likewise an explicit
   * `{ kind: "none" }`, the only way to turn a tile off without putting a shape
   * back.
   */
  source?: BackgroundSource;
}

/**
 * A sparse override applied at the Glyph tier (and the shape a Project-tier patch
 * takes). An empty object (`{}`) is a no-op, which is the default state at every
 * tier above Project — so a fresh project resolves to its Project style untouched.
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

/**
 * The Device tier's override: everything a {@link StyleOverride} carries **except
 * `background.source`** (ADR-0012 §2).
 *
 * A device-wide "everything is a plain shape" is exactly the case the tri-state on
 * {@link BackgroundOverride.source} was written to defend against: it would flatten
 * all four shoulders under one setting. Making the tier structurally unable to say
 * it removes the collision instead of settling it by precedence — so a bumper stays
 * bumper-shaped without needing to outrank anything.
 *
 * `renderSource` is left alone here: it is per-Glyph by the same argument, but its
 * `symbolId` fallback is Glyph-only in practice so the collision never arises, and
 * narrowing it is out of scope.
 *
 * `source?: never` rather than simply omitting the property: TypeScript is
 * structural, so an omitted optional field still accepts a {@link StyleOverride}
 * that carries one. `never` is what makes assigning one an error, which is what
 * turns "the Device tier cannot say this" from a comment into a rule.
 */
export type DeviceStyleOverride = Omit<StyleOverride, "background"> & {
  background?: BackgroundPaintOverride & { source?: never };
};

/**
 * Narrow an override to what the Device tier may hold, dropping any
 * `background.source` and collapsing a `background` that empties out.
 *
 * The Style panel doesn't offer the control at Device scope, so in practice this
 * only ever fires on a patch built somewhere that outlived the rule. It is the
 * one place the {@link DeviceStyleOverride} type forces a decision rather than
 * letting a source through structurally.
 */
export function withoutBackgroundSource(
  override: StyleOverride,
): DeviceStyleOverride {
  const { background, ...rest } = override;
  if (!background) return rest;
  const paint: BackgroundPaintOverride = { ...background };
  // The copy still carries a `source` key at runtime even though its type no
  // longer admits one, so drop it from the copy rather than from the input.
  delete (paint as BackgroundOverride).source;
  return Object.keys(paint).length > 0 ? { ...rest, background: paint } : rest;
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

/**
 * Resolve one Glyph's effective style through the three tiers plus its Catalog
 * **seed** (ADR-0012 §2).
 *
 * The seed is a *base* for the Background source, not a tier of its own:
 *
 * ```
 * source = Glyph override, if set; else the Catalog seed, if that Input has one;
 *          else the Project base
 * ```
 *
 * An explicit rank rather than a "only when nothing else sets it" fallback,
 * because such a fallback would never fire — the Project base is a full
 * `Background` and always carries a source.
 *
 * The Device tier is skipped for `source` **by construction**: it cannot name one
 * ({@link DeviceStyleOverride}), so nothing has to outrank it. Resolving the
 * source here rather than folding the seed into `base` is what makes that true of
 * the *data* too — persisted overrides are validated by shape, not content, so a
 * pre-ADR-0012 save can still carry a device-tier source, and it is ignored here
 * rather than obeyed.
 */
export function resolveGlyphStyle(
  base: GlyphStyle,
  seed: BackgroundSource | undefined,
  device: DeviceStyleOverride | undefined,
  glyph: StyleOverride | undefined,
): GlyphStyle {
  const style = resolveStyle(base, device, glyph);
  const source = glyph?.background?.source ?? seed ?? base.background.source;
  return { ...style, background: { ...style.background, source } };
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

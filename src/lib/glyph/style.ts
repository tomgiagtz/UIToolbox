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
 * Every property is settable at every tier. A Catalog's art **seed** ranks
 * between the Glyph and Device tiers, and supplies only what it seeds — the
 * Background source and, for a mirrored control, that layer's `scale.x`: see
 * {@link resolveGlyphStyle}.
 *
 * The font is deliberately **not** part of this cascade, and neither is
 * `cellSize`: both stay Project-global (see ADR-0006). `cellSize` is an atlas
 * output value, so it lives in `project.exportSettings` (ADR-0012 §6) rather
 * than anywhere near a style.
 */
import type {
  Background,
  BackgroundSource,
  LayerTransform,
} from "@/lib/glyph/types";

/**
 * The three **Paint Role** colours a Symbol's sentinel shapes resolve to
 * (ADR-0007): `fill` (primary ink, `#f00`), `border` (outline, `#00f`), and
 * `secondary` (highlight, `#0f0`). Independent of the label `textColor` — they
 * paint different Render Sources, and neither paints a custom image.
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
 * Sizing and orientation are deliberately **not** part of this union: the
 * foreground's {@link LayerTransform} paints whichever source is drawn, so
 * switching an Input from its Symbol to its label can't silently discard either.
 */
export type RenderSourceOverride =
  { kind: "label" } | { kind: "symbol" } | { kind: "image"; imageId: string };

/**
 * The **foreground layer** of a Glyph: whichever Render Source is drawn, and how
 * it is painted — the transform that places it, the label's colour, and the
 * Symbol's Paint Roles.
 *
 * A layer object rather than fields at the top level so the two layers are the
 * same shape: {@link Background} says where the tile art comes from and how the
 * tile is painted, and this says the same two things about the content drawn on
 * it (ADR-0012 §2). Every control in the Style panel's Foreground group writes
 * one property of this object.
 *
 * Which source it draws is missing here for the reason it is missing from
 * {@link GlyphStyle}: resolving that needs the Catalog and the image manifest,
 * not just the cascade. The *override* does carry `renderSource`, so the layer
 * the user edits is whole even though the resolved one can't be.
 */
export interface Foreground {
  transform: LayerTransform;
  textColor: string;
  symbolPaints: SymbolPaints;
}

/**
 * A fully-resolved Glyph style: the two drawing layers, and nothing else.
 *
 * The Render Source itself is **not** here: resolving it also needs the Catalog
 * entry's Symbol and the project's image manifest, so it has its own resolver
 * (`resolveRenderSource`) over the same {@link StyleOverride} tiers.
 */
export interface GlyphStyle {
  background: Background;
  foreground: Foreground;
}

/**
 * A sparse patch of a {@link LayerTransform}. Each component falls up the cascade
 * on its own, so a Device rotation and a Glyph mirror both survive — but a
 * component that *is* set **replaces** the one below rather than composing with
 * it, exactly as every other field in the cascade does.
 *
 * Sparse to the leaf, and that is load-bearing rather than tidy: a Catalog seed
 * supplies `scale.x` alone, and the seed outranks the Device tier, so a transform
 * replaced wholesale would silently erase a device-wide rotation on exactly the
 * four mirrored shoulders and nowhere else.
 */
export interface TransformOverride {
  rotation?: number;
  scale?: { x?: number; y?: number };
}

/** A sparse patch of the foreground layer; unset fields fall up the cascade. */
export interface ForegroundOverride {
  transform?: TransformOverride;
  textColor?: string;
  /** A sparse patch of the Symbol Paint Role colours; unset roles fall up (ADR-0007). */
  symbolPaints?: Partial<SymbolPaints>;
  /** Which Render Source this tier draws; replaces wholesale, never merged (#20). */
  renderSource?: RenderSourceOverride;
}

/** A sparse patch of a {@link Background}; unset fields fall up the cascade. */
export interface BackgroundOverride {
  /**
   * Where the tile is drawn from (issue #22). Replaced wholesale, never merged —
   * a source is one choice, so patching an `image` onto an `authored` base must
   * not leave a tile that is half of each.
   *
   * Omitting it falls to the Catalog **seed**; only an explicit value turns a
   * seeded tile off, `{ kind: "none" }` without putting a shape back.
   */
  source?: BackgroundSource;
  /** How the tile layer is painted; see {@link TransformOverride}. */
  transform?: TransformOverride;
  /** Read only where the resolved source is `{ kind: "shape" }`. */
  shape?: Background["shape"];
  fill?: string;
  cornerRadius?: number;
  border?: Partial<Background["border"]>;
}

/**
 * A sparse override applied at the Glyph tier (and the shape a Project-tier patch
 * takes). An empty object (`{}`) is a no-op, which is the default state at every
 * tier above Project — so a fresh project resolves to its Project style untouched.
 */
export interface StyleOverride {
  background?: BackgroundOverride;
  foreground?: ForegroundOverride;
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
 * control. Layer sub-properties are flattened so a single field names exactly
 * one setting the user can override or clear — which is why `borderWidth` and
 * `borderColor` are two entries and not one `border`.
 */
export type StyleField =
  | "textColor"
  | "shape"
  | "fill"
  | "cornerRadius"
  | "borderWidth"
  | "borderColor"
  | "backgroundSource"
  | "backgroundTransform"
  | "foregroundTransform"
  | "symbolFill"
  | "symbolBorder"
  | "symbolSecondary"
  | "renderSource";

/**
 * Fold degrees into 0–360, so a stored rotation always reads as an angle.
 *
 * Finiteness is not this function's job: `NaN` is caught at the boundary it can
 * enter by (`isTransform`, on load), rather than guarded again here where the
 * check would be unreachable and its absence unexplainable.
 */
function normalizeRotation(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/**
 * Merge two sparse {@link TransformOverride}s component-by-component, `patch`
 * winning. `scale` is merged per axis rather than replaced, so mirroring X at one
 * tier doesn't silently drop a Y scale set at the same one.
 */
function mergeTransform(
  base: TransformOverride | undefined,
  patch: TransformOverride,
): TransformOverride {
  const next: TransformOverride = { ...base, ...patch };
  if (patch.rotation !== undefined)
    next.rotation = normalizeRotation(patch.rotation);
  const scale = { ...base?.scale, ...patch.scale };
  if (Object.keys(scale).length > 0) next.scale = scale;
  return next;
}

/**
 * Deep-merge two sparse overrides, `patch` winning. Background, its border, and
 * both layer transforms are merged property-by-property so a patch can set just
 * one setting without dropping the rest of an existing override. Never mutates
 * its inputs.
 */
export function mergeOverride(
  base: StyleOverride,
  patch: StyleOverride,
): StyleOverride {
  const next: StyleOverride = { ...base };
  if (patch.background) {
    const border = { ...base.background?.border, ...patch.background.border };
    next.background = {
      ...base.background,
      ...patch.background,
      ...(Object.keys(border).length > 0 ? { border } : {}),
      ...(patch.background.transform
        ? {
            transform: mergeTransform(
              base.background?.transform,
              patch.background.transform,
            ),
          }
        : {}),
    };
  }
  if (patch.foreground) {
    const symbolPaints = {
      ...base.foreground?.symbolPaints,
      ...patch.foreground.symbolPaints,
    };
    next.foreground = {
      ...base.foreground,
      ...patch.foreground,
      ...(Object.keys(symbolPaints).length > 0 ? { symbolPaints } : {}),
      ...(patch.foreground.transform
        ? {
            transform: mergeTransform(
              base.foreground?.transform,
              patch.foreground.transform,
            ),
          }
        : {}),
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
      return override.foreground?.textColor !== undefined;
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
    case "backgroundTransform":
      return override.background?.transform !== undefined;
    case "foregroundTransform":
      return override.foreground?.transform !== undefined;
    case "symbolFill":
      return override.foreground?.symbolPaints?.fill !== undefined;
    case "symbolBorder":
      return override.foreground?.symbolPaints?.border !== undefined;
    case "symbolSecondary":
      return override.foreground?.symbolPaints?.secondary !== undefined;
    case "renderSource":
      return override.foreground?.renderSource !== undefined;
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
  if (
    field === "textColor" ||
    field === "renderSource" ||
    field === "foregroundTransform" ||
    field === "symbolFill" ||
    field === "symbolBorder" ||
    field === "symbolSecondary"
  ) {
    if (!next.foreground) return next;
    const fg: ForegroundOverride = { ...next.foreground };
    if (field === "textColor") delete fg.textColor;
    else if (field === "renderSource") delete fg.renderSource;
    else if (field === "foregroundTransform") delete fg.transform;
    else if (fg.symbolPaints) {
      const sp: Partial<SymbolPaints> = { ...fg.symbolPaints };
      if (field === "symbolFill") delete sp.fill;
      else if (field === "symbolBorder") delete sp.border;
      else delete sp.secondary;
      if (Object.keys(sp).length > 0) fg.symbolPaints = sp;
      else delete fg.symbolPaints;
    }
    if (Object.keys(fg).length > 0) next.foreground = fg;
    else delete next.foreground;
    return next;
  }
  if (!next.background) return next;
  const bg: BackgroundOverride = { ...next.background };
  if (field === "shape") delete bg.shape;
  else if (field === "backgroundSource") delete bg.source;
  else if (field === "backgroundTransform") delete bg.transform;
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
  let background: Background = {
    ...base.background,
    border: { ...base.background.border },
    transform: copyTransform(base.background.transform),
  };
  const foreground: Foreground = {
    transform: copyTransform(base.foreground.transform),
    textColor: base.foreground.textColor,
    symbolPaints: { ...base.foreground.symbolPaints },
  };

  for (const override of overrides) {
    if (!override) continue;
    if (override.background) {
      background = applyBackground(background, override.background);
    }
    const fg = override.foreground;
    if (fg) {
      if (fg.transform) {
        foreground.transform = applyTransform(
          foreground.transform,
          fg.transform,
        );
      }
      if (fg.textColor !== undefined) foreground.textColor = fg.textColor;
      if (fg.symbolPaints)
        Object.assign(foreground.symbolPaints, fg.symbolPaints);
    }
  }

  return { background, foreground };
}

/**
 * Resolve one Glyph's effective style through the three tiers plus its Catalog
 * **seed** (ADR-0012 §2), which ranks between the Glyph and Device tiers:
 *
 * ```
 * Glyph override → Catalog seed → Device tier → Project base
 * ```
 *
 * A seed is a presence fact about *that control*, so only a statement about that
 * control may overrule it. Because the seed outranks the Device tier, a
 * device-wide source no-ops on the eight seeded shoulder Inputs, and the only
 * escape is a per-Glyph override.
 *
 * The seed rides in as a pseudo-tier rather than a second pass, and is sparse
 * like any other: it names a source and — on the four left-side shoulders — that
 * layer's `scale.x`, leaving every other field of the Device tier intact. The
 * projection from the Catalog's presence facts to those values is
 * `seedStyle`'s job, not this one's.
 */
export function resolveGlyphStyle(
  base: GlyphStyle,
  seed: StyleOverride | undefined,
  device: StyleOverride | undefined,
  glyph: StyleOverride | undefined,
): GlyphStyle {
  return resolveStyle(base, device, seed, glyph);
}

/** A detached copy of a resolved transform, safe to hand back to a caller. */
function copyTransform(transform: LayerTransform): LayerTransform {
  return { rotation: transform.rotation, scale: { ...transform.scale } };
}

/**
 * Return `transform` patched with the set components of `patch`. Each component
 * **replaces** the one below rather than composing with it: a Glyph asking for
 * `rotation: 0` means upright, not "turn back by the Device's 90".
 */
function applyTransform(
  transform: LayerTransform,
  patch: TransformOverride,
): LayerTransform {
  const next = copyTransform(transform);
  if (patch.rotation !== undefined)
    next.rotation = normalizeRotation(patch.rotation);
  if (patch.scale?.x !== undefined) next.scale.x = patch.scale.x;
  if (patch.scale?.y !== undefined) next.scale.y = patch.scale.y;
  return next;
}

/** Return `bg` patched with the set fields of `patch` (border merged deeply). */
function applyBackground(
  bg: Background,
  patch: BackgroundOverride,
): Background {
  const next: Background = { ...bg, border: { ...bg.border } };
  if (patch.shape !== undefined) next.shape = patch.shape;
  // One choice, replaced whole: a tier that names a source says everything about
  // where the tile art comes from. How that art is *painted* is the layer's
  // transform, which this deliberately leaves alone.
  if (patch.source !== undefined) next.source = patch.source;
  if (patch.transform) {
    next.transform = applyTransform(bg.transform, patch.transform);
  }
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

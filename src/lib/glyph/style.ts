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
  Transform,
} from "@/lib/glyph/types";

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
 * Sizing and orientation are deliberately **not** part of this union: the content
 * layer's {@link Transform} paints whichever source is drawn, so switching an
 * Input from its Symbol to its label can't silently discard either.
 */
export type RenderSourceOverride =
  { kind: "label" } | { kind: "symbol" } | { kind: "image"; imageId: string };

/**
 * The **content layer** of a Glyph: whichever Render Source is drawn, and how it
 * is painted. An object rather than a bare field so the two drawing layers are
 * structurally identical — `background.transform` and `content.transform` are
 * the same property one level down each (ADR-0012 §2).
 *
 * Which source it draws isn't here for the same reason it isn't in
 * {@link GlyphStyle}: that needs the Catalog and the image manifest, not just
 * the cascade.
 */
export interface ContentLayer {
  transform: Transform;
}

/**
 * A fully-resolved Glyph style: the effective text color, the two drawing layers
 * (Background tile and content), and the Symbol Paint Role colours (ADR-0007 §3).
 *
 * The Render Source itself is **not** here: resolving it also needs the Catalog
 * entry's Symbol and the project's image manifest, so it has its own resolver
 * (`resolveRenderSource`) over the same {@link StyleOverride} tiers.
 */
export interface GlyphStyle {
  textColor: string;
  background: Background;
  content: ContentLayer;
  symbolPaints: SymbolPaints;
}

/**
 * A sparse patch of a {@link Transform}. Each component falls up the cascade on
 * its own, so a Device rotation and a Glyph mirror both survive — but a component
 * that *is* set **replaces** the one below rather than composing with it, exactly
 * as every other field in the cascade does.
 */
export interface TransformOverride {
  rotation?: number;
  scale?: { x?: number; y?: number };
}

/** A sparse patch of the content layer; unset fields fall up the cascade. */
export interface ContentOverride {
  transform?: TransformOverride;
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
  textColor?: string;
  background?: BackgroundOverride;
  content?: ContentOverride;
  /** A sparse patch of the Symbol Paint Role colours; unset roles fall up (ADR-0007). */
  symbolPaints?: Partial<SymbolPaints>;
  /** Which Render Source this tier draws; replaces wholesale, never merged (#20). */
  renderSource?: RenderSourceOverride;
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
 *
 * The two transforms are the exception: one entry per drawing **layer**, not per
 * component, so a Glyph-scope mirror and a Glyph-scope rotation clear together
 * (ADR-0012 §2).
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
  | "contentTransform"
  | "symbolFill"
  | "symbolBorder"
  | "symbolSecondary"
  | "renderSource";

/** Fold degrees into 0–360, so a stored rotation always reads as an angle. */
export function normalizeRotation(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
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
  if (patch.textColor !== undefined) next.textColor = patch.textColor;
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
  if (patch.content?.transform) {
    next.content = {
      ...base.content,
      transform: mergeTransform(
        base.content?.transform,
        patch.content.transform,
      ),
    };
  }
  if (patch.symbolPaints) {
    next.symbolPaints = { ...base.symbolPaints, ...patch.symbolPaints };
  }
  // A Render Source is one choice, not a bag of properties: merging an `image`
  // patch into a `label` base would leave a half-and-half override.
  if (patch.renderSource !== undefined) next.renderSource = patch.renderSource;
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
    case "backgroundTransform":
      return override.background?.transform !== undefined;
    case "contentTransform":
      return override.content?.transform !== undefined;
    case "symbolFill":
      return override.symbolPaints?.fill !== undefined;
    case "symbolBorder":
      return override.symbolPaints?.border !== undefined;
    case "symbolSecondary":
      return override.symbolPaints?.secondary !== undefined;
    case "renderSource":
      return override.renderSource !== undefined;
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
  // One entry per drawing layer: clearing a layer's transform clears its rotation
  // and its scale together (ADR-0012 §2).
  if (field === "contentTransform") {
    delete next.content;
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
  let textColor = base.textColor;
  let background: Background = {
    ...base.background,
    border: { ...base.background.border },
  };
  const symbolPaints: SymbolPaints = { ...base.symbolPaints };
  let content: ContentLayer = {
    transform: copyTransform(base.content.transform),
  };

  for (const override of overrides) {
    if (!override) continue;
    if (override.textColor !== undefined) textColor = override.textColor;
    if (override.background) {
      background = applyBackground(background, override.background);
    }
    if (override.content?.transform) {
      content = {
        transform: applyTransform(
          content.transform,
          override.content.transform,
        ),
      };
    }
    if (override.symbolPaints) {
      Object.assign(symbolPaints, override.symbolPaints);
    }
  }

  return { textColor, background, content, symbolPaints };
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
function copyTransform(transform: Transform): Transform {
  return { rotation: transform.rotation, scale: { ...transform.scale } };
}

/**
 * Return `transform` patched with the set components of `patch`. Each component
 * **replaces** the one below rather than composing with it: a Glyph asking for
 * `rotation: 0` means upright, not "turn back by the Device's 90".
 */
function applyTransform(
  transform: Transform,
  patch: TransformOverride,
): Transform {
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

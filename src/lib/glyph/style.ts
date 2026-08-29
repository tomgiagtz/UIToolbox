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
 * {@link glyphTiers}, which is where that order is written.
 *
 * The grid `cellSize` is the one property that stays Project-global: it is an
 * atlas output value, so it lives in `project.exportSettings` (ADR-0012 §6)
 * rather than anywhere near a style. ADR-0006 held the font out too, which was
 * right while a project had exactly one and stopped applying the moment it
 * could have two (ADR-0012 §2).
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
 * Input (ADR-0004). `image` naming an asset the project doesn't carry, and
 * `symbol` resolving to no Symbol at all, both fall back to the default — see
 * `resolveRenderSource`.
 *
 * `symbol` is the one variant whose id is **optional**, and the two spellings
 * mean different things (ADR-0015). Omitted is "whatever Symbol the Catalog
 * gives this Input", so the Glyph keeps tracking the Catalog and a Catalog fix
 * reaches it; a `symbolId` **pins** one Symbol — shipped or imported — which is
 * what lets any Glyph draw any Symbol rather than only its own Catalog's, and
 * so what makes an imported Set's new drawings reachable at all.
 *
 * Sizing and orientation are deliberately **not** part of this union: the
 * foreground's {@link LayerTransform} paints whichever source is drawn, so
 * switching an Input from its Symbol to its label can't silently discard either.
 */
export type RenderSourceOverride =
  | { kind: "label" }
  | { kind: "symbol"; symbolId?: string }
  | { kind: "image"; imageId: string };

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
  /**
   * Registered FontFace family the **label** is drawn in (ADR-0012 §2).
   *
   * A family rather than an id into `project.fonts`: the draw path needs a
   * family and nothing else (`document.fonts` is keyed by it), an id would add
   * a lookup on every resolve whose miss has no good answer, and a family is
   * what makes "a Preset may only name a bundled family" expressible in the
   * type. Uploads can never collide with a bundled name because
   * `loadFontFromFile` mints `UITBFont-<ts>-<rand>`.
   *
   * It sits in this layer rather than on {@link GlyphStyle} because it paints
   * the label, which is one of the foreground's Render Sources — a resolved
   * style is the two layers and nothing else.
   */
  fontFamily: string;
  /**
   * Weight the label is drawn at, as a CSS numeric weight.
   *
   * Meaningful only where the resolved family is a **variable** font: a static
   * face has one weight, and asking a browser for another gets synthesised fake
   * bold. Which is which is a property of the file, so it is read from the
   * bytes at registration (`font-axes.ts`) rather than stated here — this is
   * the request, not the promise.
   *
   * Separate from {@link fontFamily} rather than folded into it because they
   * are two controls the user moves independently, and because a weight has to
   * survive switching family for the panel to feel like one setting.
   */
  fontWeight: number;
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
  /** Which family this tier draws its label in; settable at every tier. */
  fontFamily?: string;
  /** Which weight of that family; only variable faces offer a choice. */
  fontWeight?: number;
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
 *
 * A transform is two entries per layer for the same reason: rotation and scale
 * are separate controls, and one reset button over a pair of them would have no
 * honest home in the panel. `x` and `y` stay together under `…Scale`, because
 * mirroring is one gesture and the two numbers are one control.
 */
export type StyleField =
  | "font"
  | "fontWeight"
  | "textColor"
  | "shape"
  | "fill"
  | "cornerRadius"
  | "borderWidth"
  | "borderColor"
  | "backgroundSource"
  | "backgroundRotation"
  | "backgroundScale"
  | "foregroundRotation"
  | "foregroundScale"
  | "symbolFill"
  | "symbolBorder"
  | "symbolSecondary"
  | "renderSource";

/**
 * Fold degrees into −180…180, the canonical spelling of an angle here: the range
 * the control spans, centred on 0 so a quarter-turn anticlockwise reads `-90`
 * rather than `270`.
 *
 * A value **already** in range is returned untouched, which is the whole reason
 * this isn't the usual one-liner: `((d + 180) % 360 + 360) % 360 - 180` maps
 * `180` to `-180`, so dragging the slider to one end would snap the thumb to the
 * other. Both ends are legal and stable.
 *
 * Call it where a rotation is **written** — the control's commit, and the Preset
 * build gate. Not in {@link resolveStyle}: any finite value draws correctly
 * (`deg * π / 180` is right for `-90`, `450` and `0` alike), so normalising
 * during resolution would make a pure fold over plain data do arithmetic on
 * every render for no observable gain. Finiteness is likewise not this function's
 * job — `NaN` is caught at the boundary it can enter by, `isLayerTransform`.
 */
export function normalizeRotation(degrees: number): number {
  if (degrees >= -180 && degrees <= 180) return degrees;
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

/**
 * Drop one component from a sparse transform, returning `undefined` once nothing
 * is left — so clearing a layer's rotation when it set no scale collapses the
 * whole override rather than leaving an empty `transform: {}` behind, which
 * `isOverrideFieldSet` would then report as "set" for neither component and the
 * reset button would offer forever.
 */
function clearTransformComponent(
  transform: TransformOverride | undefined,
  part: "rotation" | "scale",
): TransformOverride | undefined {
  if (!transform) return undefined;
  const next: TransformOverride = { ...transform };
  delete next[part];
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Set or drop a layer override's `transform`, keeping the layer collapsible. */
function setTransform(
  layer: BackgroundOverride | ForegroundOverride,
  transform: TransformOverride | undefined,
): void {
  if (transform) layer.transform = transform;
  else delete layer.transform;
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
    case "font":
      return override.foreground?.fontFamily !== undefined;
    case "fontWeight":
      return override.foreground?.fontWeight !== undefined;
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
    case "backgroundRotation":
      return override.background?.transform?.rotation !== undefined;
    case "backgroundScale":
      return override.background?.transform?.scale !== undefined;
    case "foregroundRotation":
      return override.foreground?.transform?.rotation !== undefined;
    case "foregroundScale":
      return override.foreground?.transform?.scale !== undefined;
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
    field === "font" ||
    field === "fontWeight" ||
    field === "textColor" ||
    field === "renderSource" ||
    field === "foregroundRotation" ||
    field === "foregroundScale" ||
    field === "symbolFill" ||
    field === "symbolBorder" ||
    field === "symbolSecondary"
  ) {
    if (!next.foreground) return next;
    const fg: ForegroundOverride = { ...next.foreground };
    if (field === "font") delete fg.fontFamily;
    else if (field === "fontWeight") delete fg.fontWeight;
    else if (field === "textColor") delete fg.textColor;
    else if (field === "renderSource") delete fg.renderSource;
    else if (field === "foregroundRotation" || field === "foregroundScale") {
      setTransform(
        fg,
        clearTransformComponent(
          fg.transform,
          field === "foregroundRotation" ? "rotation" : "scale",
        ),
      );
    } else if (fg.symbolPaints) {
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
  else if (field === "backgroundRotation" || field === "backgroundScale") {
    setTransform(
      bg,
      clearTransformComponent(
        bg.transform,
        field === "backgroundRotation" ? "rotation" : "scale",
      ),
    );
  } else if (field === "fill") delete bg.fill;
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
    fontFamily: base.foreground.fontFamily,
    fontWeight: base.foreground.fontWeight,
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
      if (fg.fontFamily !== undefined) foreground.fontFamily = fg.fontFamily;
      if (fg.fontWeight !== undefined) foreground.fontWeight = fg.fontWeight;
      if (fg.textColor !== undefined) foreground.textColor = fg.textColor;
      if (fg.symbolPaints)
        Object.assign(foreground.symbolPaints, fg.symbolPaints);
    }
  }

  return { background, foreground };
}

/** The tiers that stand above the Project base for one Glyph. */
export interface GlyphTiers {
  device?: StyleOverride;
  /** What that Input's Catalog entry seeds — `seedStyle`'s projection. */
  seed?: StyleOverride;
  glyph?: StyleOverride;
}

/**
 * The tiers above the Project base for one Glyph, in **ascending precedence** —
 * the single place the cascade's order is written (#51):
 *
 * ```
 * Project base ‹ Device tier ‹ Catalog seed ‹ Glyph override
 * ```
 *
 * Written low-to-high, matching the returned list: read it the other way and a
 * caller folding the array gets the cascade exactly backwards.
 *
 * Named rather than positional because the order is the whole content of this
 * function: a caller states which tier each override *is* and cannot silently
 * transpose two of them. Every consumer of the order — {@link resolveStyle} for
 * the style, `resolveRenderSource` for the source drawn — folds this one list, so
 * the panel and the atlas cannot disagree about a Glyph.
 *
 * An unset tier stays in place as `undefined` rather than being dropped: the
 * ranks are positions, and both folds skip a missing one anyway.
 *
 * A seed is a presence fact about *that control* (ADR-0012 §2), so only a
 * statement about that control may overrule it. Because it outranks the Device tier, a device-wide
 * source no-ops on the eight seeded shoulder Inputs, and the only escape is a
 * per-Glyph override. It rides in as a pseudo-tier rather than a second pass, and
 * is sparse like any other: it names a source and — on the four left-side
 * shoulders — that layer's `scale.x`, leaving the Device tier otherwise intact.
 */
export function glyphTiers({
  device,
  seed,
  glyph,
}: GlyphTiers): (StyleOverride | undefined)[] {
  return [device, seed, glyph];
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
  if (patch.rotation !== undefined) next.rotation = patch.rotation;
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

/**
 * Drawing **Symbols** as a Glyph's Render Source (issue #17).
 *
 * A Symbol ships as a standalone SVG painted in **Paint Role** sentinels
 * (`#f00` fill / `#00f` border / `#0f0` secondary; see `paint-roles.mjs`). To
 * draw one, its sentinels are recoloured through the Style Cascade and the result
 * is rasterized to a bitmap the shared {@link renderGlyph} compositor can draw —
 * so live preview and the exported atlas stay pixel-identical.
 *
 * Colour model: each role resolves to its own colour from the Glyph's resolved
 * `symbolPaints` cascade group — fill / border / secondary independently (ADR-0007
 * §3). Non-sentinel paints pass through as authored.
 *
 * **Authored Background** tiles (issue #18) are recoloured and rasterized here
 * too. They're a distinct concept — the tile a Symbol is drawn *on* — but the
 * sentinel model and the cache are identical, so only their role-colour source
 * differs (see {@link backgroundRoleColors}).
 */
import { createBitmapCache, decodeToBitmap } from "@/lib/glyph/bitmap-cache";
import type { GlyphStyle } from "@/lib/glyph/style";
import type { PaintRole, RoleColors } from "@/lib/glyph/types";
import { classifyPaint } from "@/lib/glyph/symbols/paint-roles.mjs";
import { getSymbolSvg } from "@/lib/glyph/symbols";
import { onSetArtChange } from "@/lib/glyph/symbols/set-art";

// The vocabulary itself lives with the rest of the domain model, since an
// imported Symbol Set carries roles and flags in its config and cannot depend on
// the draw path. Re-exported here because this is where the app has always
// spelled it.
export type { PaintRole, RoleColors };

/**
 * The colour each paint role resolves to for a Glyph's **Symbol**: the resolved
 * `symbolPaints` group (fill / border / secondary), each cascaded independently
 * of the label `textColor` (ADR-0007 §3).
 */
export function symbolRoleColors(style: GlyphStyle): RoleColors {
  const { fill, border, secondary } = style.foreground.symbolPaints;
  return { fill, border, secondary };
}

/**
 * The colour each paint role resolves to for an **Authored Background** tile
 * (issue #18): its fill sentinel follows the Background `fill`, its border sentinel
 * the Background `border.color` (secondary falls back to the fill). So the shipped
 * bumper/trigger tiles restyle through the ordinary Background controls.
 */
export function backgroundRoleColors(style: GlyphStyle): RoleColors {
  const { fill, border } = style.background;
  return { fill, border: border.color, secondary: fill };
}

/**
 * Replace a Symbol SVG's sentinel paints with their resolved role colours,
 * leaving every non-sentinel paint exactly as authored (the "fixed-colour"
 * pass-through). Only hex tokens are matched — the shipped atlases author
 * sentinels as hex — so authored `rgb()`/named colours are left untouched.
 */
export function recolorSymbolSvg(svg: string, colors: RoleColors): string {
  return svg.replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, (token) => {
    // Reuse the one shared classifier (ADR-0007) so roles can't diverge.
    const role = classifyPaint(token) as PaintRole | null;
    return role ? colors[role] : token;
  });
}

/** A Symbol SVG split into its `viewBox` and inner markup, for inline embedding. */
export interface SymbolInner {
  viewBox: string;
  inner: string;
}

/**
 * Split a standalone Symbol SVG into its `viewBox` and inner markup so callers
 * (e.g. the Device Layout) can drop it into a positioned nested `<svg>`. Returns
 * `null` if the string isn't a single `<svg viewBox=…>…</svg>`.
 */
export function symbolInner(svg: string): SymbolInner | null {
  const match =
    /^<svg\b[^>]*\bviewBox="([^"]*)"[^>]*>([\s\S]*)<\/svg>\s*$/i.exec(svg);
  if (!match) return null;
  return { viewBox: match[1], inner: match[2] };
}

// --- Rasterization cache ---------------------------------------------------
//
// Rasterizing an SVG needs the DOM (Image decode) + createImageBitmap, so it only
// runs in the browser; under jsdom/SSR the shared cache makes it a no-op and the
// renderer falls back to the label. Bitmaps are cached by namespace + asset id +
// role colours + size, so the preview and compositor share one decode per
// appearance.
//
// "Asset" here covers both sentinel-painted SVGs this module rasterizes — a
// Symbol and an Authored Background tile. They stay distinct concepts (a Symbol
// is drawn *on* a tile), but they recolour and cache identically, and the
// glossary has no word for that overlap.

/** One asset's drawable appearance: which asset, recoloured how, at what size. */
export interface AssetAppearance {
  /** Separates Symbols from Authored Background tiles, which share id space. */
  namespace: "sym" | "bg";
  id: string;
  colors: RoleColors;
  size: number;
  /** Catalog id, selecting a device-specific override of the same asset id. */
  device?: string;
}

/**
 * Flatten an appearance to its cache key. Every field that changes what the
 * bitmap looks like has to appear here, or two different appearances share one
 * decode and the wrong art draws — hence the direct test.
 */
export function appearanceKey({
  namespace,
  device,
  id,
  colors,
  size,
}: AssetAppearance): string {
  return `${namespace}|${device ?? ""}|${id}|${colors.fill}|${colors.border}|${colors.secondary}|${size}`;
}

const bitmaps = createBitmapCache(appearanceKey, rasterize);

// Importing, refreshing or removing a Symbol Set changes what an id draws, and a
// cache key carries the id but not the art behind it. So the whole cache goes
// when the registry does: the alternative is evicting by id across three
// namespaces and every warm size, to save a refill that happens on the next
// draw. Same trade `forgetImage` makes.
//
// Dropping is only half of it — the draw path re-warms from the appearance keys
// it already holds, which have not moved. `useRenderSourceBitmaps` folds the
// registry's version into its key for exactly that reason; the registry only
// notifies when the *art* differs, so neither side fires on a no-op load.
onSetArtChange(() => bitmaps.clear());

/**
 * One kind of asset's draw-path pair, bound to the shared cache: its key
 * namespace plus how a Glyph's resolved style supplies the role colours.
 * Symbols and Authored Background tiles differ in nothing else.
 */
function assetBitmaps(
  namespace: AssetAppearance["namespace"],
  roleColors: (style: GlyphStyle) => RoleColors,
) {
  const appearance = (
    id: string,
    style: GlyphStyle,
    size: number,
    device?: string,
  ): AssetAppearance => ({
    namespace,
    id,
    colors: roleColors(style),
    size,
    device,
  });

  return {
    get: (id: string, style: GlyphStyle, size: number, device?: string) =>
      bitmaps.get(appearance(id, style, size, device)),
    ensure: (id: string, style: GlyphStyle, size: number, device?: string) =>
      bitmaps.ensure(appearance(id, style, size, device)),
  };
}

/** Symbols, recoloured through the `symbolPaints` cascade group (ADR-0007 §3). */
const symbols = assetBitmaps("sym", symbolRoleColors);

/**
 * Authored Background tiles, recoloured through the Background fill / border so
 * the shipped bumper and trigger tiles restyle with the ordinary Background
 * controls (issue #18).
 */
const backgrounds = assetBitmaps("bg", backgroundRoleColors);

/**
 * The already-rasterized bitmap for a Symbol at a Glyph's resolved appearance and
 * size, or `undefined` if it hasn't been loaded yet. Synchronous, for the draw
 * path; warm the cache first with {@link ensureSymbolBitmap}. Pass the Device's
 * Catalog id so a device-specific Symbol override resolves the same as elsewhere.
 */
export const getSymbolBitmap = symbols.get;

/**
 * Rasterize (and cache) a Symbol at a Glyph's resolved appearance and size,
 * resolving to the bitmap — or `null` when the symbol is unknown or rasterization
 * isn't available (SSR / test). `device` (a Catalog id) selects a device-specific
 * Symbol override.
 */
export const ensureSymbolBitmap = symbols.ensure;

/**
 * The already-rasterized bitmap for an Authored Background tile at a Glyph's
 * resolved Background colours and size, or `undefined` if it isn't loaded yet.
 * Synchronous draw-path peer of {@link getSymbolBitmap}; warm with
 * {@link ensureBackgroundBitmap} (issue #18).
 */
export const getBackgroundBitmap = backgrounds.get;

/**
 * Rasterize (and cache) an Authored Background tile at a Glyph's resolved Background
 * colours and size. Peer of {@link ensureSymbolBitmap}; recolours the tile's
 * sentinels via {@link backgroundRoleColors} so it follows the Background fill /
 * border (issue #18).
 */
export const ensureBackgroundBitmap = backgrounds.ensure;

async function rasterize({
  id,
  colors,
  size,
  device,
}: AssetAppearance): Promise<ImageBitmap | null> {
  const svg = getSymbolSvg(id, device);
  if (!svg) return null;

  // Give the SVG an intrinsic pixel size so the Image decodes at `size` and the
  // sentinels are already resolved to their role colours before rasterizing.
  const sized = recolorSymbolSvg(svg, colors).replace(
    "<svg",
    `<svg width="${size}" height="${size}"`,
  );
  return decodeToBitmap(new Blob([sized], { type: "image/svg+xml" }));
}

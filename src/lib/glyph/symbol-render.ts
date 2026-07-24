/**
 * Drawing **Symbols** as a Glyph's Render Source (issue #17).
 *
 * A Symbol ships as a standalone SVG painted in **Paint Role** sentinels
 * (`#f00` fill / `#00f` border / `#0f0` secondary; see `paint-roles.mjs`). To
 * draw one, its sentinels are recoloured through the Style Cascade and the result
 * is rasterized to a bitmap the shared {@link renderGlyph} compositor can draw —
 * so live preview and the exported atlas stay pixel-identical.
 *
 * Colour model, this slice: every role resolves to the Glyph's `textColor` (a
 * Symbol "follows the resolved text colour"). Non-sentinel paints pass through as
 * authored. The per-role `symbolPaints` cascade group that splits fill / border /
 * secondary is follow-up work (issue #37, ADR-0007); {@link symbolRoleColors} is
 * the seam it will grow into.
 */
import type { GlyphStyle } from "@/lib/glyph/style";
import { classifyPaint } from "@/lib/glyph/symbols/paint-roles.mjs";
import { getSymbolSvg } from "@/lib/glyph/symbols";

/** The three paint roles a Symbol's sentinel shapes encode (ADR-0007). */
export type PaintRole = "fill" | "border" | "secondary";

/** The concrete colour each paint role resolves to for one Glyph. */
export type RoleColors = Record<PaintRole, string>;

/**
 * The colour each paint role resolves to for a Glyph. This slice maps all three
 * roles to the resolved `textColor`; issue #37 replaces this with the
 * `symbolPaints` cascade group (fill / border / secondary resolved separately).
 */
export function symbolRoleColors(style: GlyphStyle): RoleColors {
  const c = style.textColor;
  return { fill: c, border: c, secondary: c };
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
// runs in the browser; under jsdom/SSR these guards make it a no-op and the
// renderer falls back to the label. Bitmaps are cached by symbol id + role
// colours + size so the preview and compositor share one decode per appearance.

const bitmapCache = new Map<string, ImageBitmap>();
const inFlight = new Map<string, Promise<ImageBitmap | null>>();

function cacheKey(
  symbolId: string,
  colors: RoleColors,
  size: number,
  device?: string,
): string {
  return `${device ?? ""}|${symbolId}|${colors.fill}|${colors.border}|${colors.secondary}|${size}`;
}

/**
 * The already-rasterized bitmap for a Symbol at a Glyph's resolved appearance and
 * size, or `undefined` if it hasn't been loaded yet. Synchronous, for the draw
 * path; warm the cache first with {@link ensureSymbolBitmap}. Pass the Device's
 * Catalog id so a device-specific Symbol override resolves the same as elsewhere.
 */
export function getSymbolBitmap(
  symbolId: string,
  style: GlyphStyle,
  size: number,
  device?: string,
): ImageBitmap | undefined {
  return bitmapCache.get(
    cacheKey(symbolId, symbolRoleColors(style), size, device),
  );
}

/**
 * Rasterize (and cache) a Symbol at a Glyph's resolved appearance and size,
 * resolving to the bitmap — or `null` when the symbol is unknown or rasterization
 * isn't available (SSR / test). Concurrent callers for the same appearance share
 * one decode. `device` (a Catalog id) selects a device-specific Symbol override.
 */
export function ensureSymbolBitmap(
  symbolId: string,
  style: GlyphStyle,
  size: number,
  device?: string,
): Promise<ImageBitmap | null> {
  const colors = symbolRoleColors(style);
  const key = cacheKey(symbolId, colors, size, device);
  const cached = bitmapCache.get(key);
  if (cached) return Promise.resolve(cached);

  const pending = inFlight.get(key);
  if (pending) return pending;

  const load = rasterize(symbolId, colors, size, device)
    .then((bitmap) => {
      if (bitmap) bitmapCache.set(key, bitmap);
      inFlight.delete(key);
      return bitmap;
    })
    .catch(() => {
      inFlight.delete(key);
      return null;
    });
  inFlight.set(key, load);
  return load;
}

async function rasterize(
  symbolId: string,
  colors: RoleColors,
  size: number,
  device?: string,
): Promise<ImageBitmap | null> {
  const svg = getSymbolSvg(symbolId, device);
  if (!svg) return null;
  if (
    typeof createImageBitmap !== "function" ||
    typeof Image === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return null;
  }

  // Give the SVG an intrinsic pixel size so the Image decodes at `size` and the
  // sentinels are already resolved to their role colours before rasterizing.
  const sized = recolorSymbolSvg(svg, colors).replace(
    "<svg",
    `<svg width="${size}" height="${size}"`,
  );
  const url = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
  try {
    const img = new Image(size, size);
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return await createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

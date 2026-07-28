/**
 * Resolving a Glyph's **Background tile** bitmap (issue #22).
 *
 * A tile comes from one of two kinds of art — a shipped **Authored Background**
 * SVG (recoloured through the cascade, see `symbol-render.ts`) or one of the
 * user's **uploaded images** (drawn as authored, see `images.ts`) — and the third
 * source, a plain shape, is drawn by the renderer with no bitmap at all.
 *
 * Both caches are keyed differently and neither is this module's business; what
 * is, is that preview and compositor pick the same bitmap for the same resolved
 * style. So the switch on the Background source lives here once, rather than
 * three times across the draw paths.
 */
import { ensureImageBitmap, getImageBitmap } from "@/lib/glyph/images";
import type { GlyphStyle } from "@/lib/glyph/style";
import {
  ensureBackgroundBitmap,
  getBackgroundBitmap,
} from "@/lib/glyph/symbol-render";

/**
 * The already-rasterized tile bitmap for a resolved style, or `undefined` when
 * the Background is a plain shape, the art is unknown, or it hasn't been warmed
 * yet. Synchronous, for the draw path; warm it with {@link ensureTileBitmap}.
 * `device` (a Catalog id) selects a device-specific Authored Background.
 */
export function getTileBitmap(
  style: GlyphStyle,
  size: number,
  device?: string,
): ImageBitmap | undefined {
  const source = style.background.source;
  if (source.kind === "authored") {
    return getBackgroundBitmap(source.backgroundId, style, size, device);
  }
  if (source.kind === "image") return getImageBitmap(source.imageId, size);
  return undefined;
}

/**
 * Rasterize (and cache) the tile art a resolved style draws, resolving to the
 * bitmap — or `null` for a plain shape, art that isn't there, or an environment
 * without rasterization (SSR / test). The renderer falls back to the plain shape
 * in every one of those cases, so a missing tile is never fatal.
 */
export function ensureTileBitmap(
  style: GlyphStyle,
  size: number,
  device?: string,
): Promise<ImageBitmap | null> {
  const source = style.background.source;
  if (source.kind === "authored") {
    return ensureBackgroundBitmap(source.backgroundId, style, size, device);
  }
  if (source.kind === "image") return ensureImageBitmap(source.imageId, size);
  return Promise.resolve(null);
}

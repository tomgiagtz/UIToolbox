"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ensureTileBitmap } from "@/lib/glyph/background-render";
import { ensureImageBitmap } from "@/lib/glyph/images";
import type { GlyphStyle } from "@/lib/glyph/style";
import { ensureSymbolBitmap } from "@/lib/glyph/symbol-render";
import { getSetArtVersion, onSetArtChange } from "@/lib/glyph/symbols/set-art";

/**
 * A stable key for one spec's **Background tile** art — which art, recoloured
 * how. An uploaded tile draws as authored, so only its id varies its bitmap;
 * an Authored Background follows the resolved Background fill + border colour.
 * Empty for the two sources that need no bitmap at all: a plain shape, and
 * "none", which draws nothing.
 */
function tileKey(style: GlyphStyle): string {
  const { source, fill, border } = style.background;
  if (source.kind === "image") return `img:${source.imageId}`;
  if (source.kind === "authored")
    return `bg:${source.backgroundId}:${fill}:${border.color}`;
  return "";
}

/** One Glyph's Render Source to warm: its Symbol or image id + resolved style. */
export interface RenderSourceSpec {
  symbolId?: string;
  imageId?: string;
  style: GlyphStyle;
}

/**
 * Warm the shared bitmap caches for `specs` — Symbol and custom-image Render
 * Sources, plus any Background tile art (`style.background.source`, whether an
 * Authored Background or an uploaded image)
 * — returning a version number that bumps once asynchronous rasterization
 * finishes, so the caller can redraw and pick up the ready bitmaps (via
 * `getSymbolBitmap` / `getImageBitmap` / `getBackgroundBitmap`).
 *
 * Keyed on a **stable string** of the appearances needed (id + resolved colour +
 * size + device), never the `specs` array — whose identity changes every render —
 * so the version bump can't re-trigger the effect into a render loop. Shared by
 * {@link AtlasPreview} (many Glyphs) and {@link GlyphPreview} (one).
 */
export function useRenderSourceBitmaps(
  specs: RenderSourceSpec[],
  size: number,
  device?: string,
): number {
  const withSymbols = specs.filter((s) => s.symbolId);
  const withImages = specs.filter((s) => s.imageId);
  // An empty key is exactly "this Background is a plain shape, no art to warm",
  // so the one switch in `tileKey` decides both which specs need a bitmap and
  // what to key it on.
  const withTiles = specs.filter((s) => tileKey(s.style) !== "");
  // Read through React so a change re-renders the caller as well as re-keying:
  // the registry is module state the draw path reads on every rasterization.
  const setArtVersion = useSyncExternalStore(
    onSetArtChange,
    getSetArtVersion,
    // Server-rendered, there is no registry and no art — one stable value, or
    // hydration would see a mismatch it cannot resolve.
    () => 0,
  );
  const key =
    withSymbols
      .map((s) => {
        const p = s.style.foreground.symbolPaints;
        return `${s.symbolId}:${p.fill}:${p.border}:${p.secondary}`;
      })
      .join("|") +
    "~" +
    withTiles.map((s) => tileKey(s.style)).join("|") +
    // A custom image draws as authored, so only its id varies the bitmap — not
    // any resolved colour, and not its transform (applied at draw time).
    "~" +
    withImages.map((s) => s.imageId).join("|") +
    `@${size}#${device ?? ""}` +
    // Importing, refreshing or removing a Symbol Set changes what an id draws
    // without changing any appearance above: the key carries the id, not the
    // drawing behind it. Dropping the stale bitmaps is `symbol-render`'s job;
    // asking for the new ones is this key's, and without it the Glyph would sit
    // on its label until an unrelated edit moved something else (ADR-0015 §4).
    `!${setArtVersion}`;

  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (
      withSymbols.length === 0 &&
      withImages.length === 0 &&
      withTiles.length === 0
    )
      return;
    let cancelled = false;
    Promise.all([
      ...withSymbols.map((s) =>
        ensureSymbolBitmap(s.symbolId!, s.style, size, device),
      ),
      ...withImages.map((s) => ensureImageBitmap(s.imageId!, size)),
      ...withTiles.map((s) => ensureTileBitmap(s.style, size, device)),
    ]).then(() => {
      if (!cancelled) setVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
    // The spec lists, `size`, and `device` are all captured by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return version;
}

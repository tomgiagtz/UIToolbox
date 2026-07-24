"use client";

import { useEffect, useState } from "react";
import type { GlyphStyle } from "@/lib/glyph/style";
import { ensureSymbolBitmap } from "@/lib/glyph/symbol-render";

/** One Glyph's Symbol Render Source to warm: its id (if any) + resolved style. */
export interface SymbolSpec {
  symbolId?: string;
  style: GlyphStyle;
}

/**
 * Warm the shared Symbol bitmap cache for `specs`, returning a version number
 * that bumps once asynchronous rasterization finishes so the caller can redraw
 * and pick up the ready bitmaps (via `getSymbolBitmap`).
 *
 * Keyed on a **stable string** of the appearances needed (id + resolved colour +
 * size + device), never the `specs` array — whose identity changes every render —
 * so the version bump can't re-trigger the effect into a render loop. Shared by
 * {@link AtlasPreview} (many Glyphs) and {@link GlyphPreview} (one).
 */
export function useSymbolBitmaps(
  specs: SymbolSpec[],
  size: number,
  device?: string,
): number {
  const withSymbols = specs.filter((s) => s.symbolId);
  const key =
    withSymbols.map((s) => `${s.symbolId}:${s.style.textColor}`).join("|") +
    `@${size}#${device ?? ""}`;

  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (withSymbols.length === 0) return;
    let cancelled = false;
    Promise.all(
      withSymbols.map((s) =>
        ensureSymbolBitmap(s.symbolId!, s.style, size, device),
      ),
    ).then(() => {
      if (!cancelled) setVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
    // `withSymbols`, `size`, and `device` are all captured by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return version;
}

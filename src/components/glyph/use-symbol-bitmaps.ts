"use client";

import { useEffect, useState } from "react";
import type { GlyphStyle } from "@/lib/glyph/style";
import {
  ensureBackgroundBitmap,
  ensureSymbolBitmap,
} from "@/lib/glyph/symbol-render";

/** One Glyph's Symbol Render Source to warm: its id (if any) + resolved style. */
export interface SymbolSpec {
  symbolId?: string;
  style: GlyphStyle;
}

/**
 * Warm the shared bitmap cache for `specs` — both Symbol Render Sources and any
 * Authored Background tiles (`style.background.backgroundId`) — returning a version
 * number that bumps once asynchronous rasterization finishes so the caller can
 * redraw and pick up the ready bitmaps (via `getSymbolBitmap` /
 * `getBackgroundBitmap`).
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
  const withBackgrounds = specs.filter((s) => s.style.background.backgroundId);
  const key =
    withSymbols
      .map((s) => {
        const p = s.style.symbolPaints;
        return `${s.symbolId}:${p.fill}:${p.border}:${p.secondary}`;
      })
      .join("|") +
    "~" +
    withBackgrounds
      .map(
        (s) =>
          `${s.style.background.backgroundId}:${s.style.background.fill}:${s.style.background.border.color}`,
      )
      .join("|") +
    `@${size}#${device ?? ""}`;

  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (withSymbols.length === 0 && withBackgrounds.length === 0) return;
    let cancelled = false;
    Promise.all([
      ...withSymbols.map((s) =>
        ensureSymbolBitmap(s.symbolId!, s.style, size, device),
      ),
      ...withBackgrounds.map((s) =>
        ensureBackgroundBitmap(
          s.style.background.backgroundId!,
          s.style,
          size,
          device,
        ),
      ),
    ]).then(() => {
      if (!cancelled) setVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
    // `withSymbols`/`withBackgrounds`, `size`, and `device` are all captured by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return version;
}

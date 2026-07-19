"use client";

import { useEffect, type DependencyList, type RefObject } from "react";
import type { Canvas2DContext } from "@/lib/glyph/renderer";

/**
 * Shared canvas draw effect for the Glyph previews. Acquires a 2D context, waits
 * for the font (so label auto-shrink measures the real glyphs), then runs
 * `draw`, cancelling cleanly on unmount or dep change.
 *
 * Both {@link GlyphPreview} (one Glyph) and {@link AtlasPreview} (a packed
 * atlas) drive their canvas through this hook so their font-gating and teardown
 * stay identical — only the `draw` body differs.
 */
export function useGlyphCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  fontFamily: string,
  cellSize: number,
  draw: (ctx: Canvas2DContext) => void,
  deps: DependencyList,
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    const run = () => {
      if (!cancelled) draw(ctx);
    };

    if (typeof document !== "undefined" && "fonts" in document) {
      const probe = `${Math.floor(cellSize * 0.5)}px "${fontFamily}"`;
      document.fonts.load(probe).then(run).catch(run);
    } else {
      run();
    }

    return () => {
      cancelled = true;
    };
    // `draw` and everything it reads are captured by the caller's `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

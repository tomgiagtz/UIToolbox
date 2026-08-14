"use client";

import { useEffect, type DependencyList, type RefObject } from "react";
import type { Canvas2DContext } from "@/lib/glyph/renderer";

/**
 * Shared canvas draw effect for the Glyph previews. Acquires a 2D context, waits
 * for the fonts (so label auto-shrink measures the real glyphs), then runs
 * `draw`, cancelling cleanly on unmount or dep change.
 *
 * Both {@link GlyphPreview} (one Glyph) and {@link AtlasPreview} (a packed
 * atlas) drive their canvas through this hook so their font-gating and teardown
 * stay identical — only the `draw` body differs.
 *
 * `faces` is plural because the font cascades: one atlas can draw as many faces
 * as it has Glyphs (ADR-0012 §2). Each is probed at the weight it will be drawn
 * at, since that is what selects the instance of a variable font. A face that
 * fails to load still draws — in the canvas fallback — since a preview that
 * renders the wrong font beats one that never appears. Export does not take
 * that trade (`ensureFamiliesRegistered`).
 */
export function useGlyphCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  faces: { family: string; weight: number }[],
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
      const size = Math.floor(cellSize * 0.5);
      const probes = faces.map(({ family, weight }) =>
        document.fonts
          .load(`${weight} ${size}px "${family}"`)
          .catch(() => undefined),
      );
      // `allSettled` semantics via the per-probe catch: one unavailable face
      // must not hold back the Glyphs drawn in the others.
      Promise.all(probes).then(run).catch(run);
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

"use client";

import { useRef, type CSSProperties } from "react";
import { getTileBitmap } from "@/lib/glyph/background-render";
import { renderGlyph } from "@/lib/glyph/renderer";
import { getSymbolBitmap } from "@/lib/glyph/symbol-render";
import type { Foreground } from "@/lib/glyph/style";
import type { Background } from "@/lib/glyph/types";
import { useGlyphCanvas } from "./use-glyph-canvas";
import { useRenderSourceBitmaps } from "./use-render-source-bitmaps";

export interface GlyphPreviewProps {
  label: string;
  cellSize?: number;
  /** The tile layer: where its art comes from, and how it is painted. */
  background: Background;
  /**
   * The foreground layer: how whichever Render Source is drawn is placed and
   * painted (ADR-0012 §2). The two props are the two layers, so a preview is
   * specified exactly as a resolved {@link GlyphStyle} is.
   */
  foreground: Foreground;
  /** Registered FontFace family name (or any CSS family for previews). */
  fontFamily: string;
  /** Symbol id to draw as this Glyph's Render Source, or unset for the label. */
  symbolId?: string;
  /** The Device's Catalog id, so a device-specific Symbol override resolves. */
  device?: string;
  className?: string;
  /**
   * Optional CSS override for the on-screen size. The canvas is still rendered
   * at `cellSize` resolution; this only scales how large it's displayed, so a
   * grid can pin a uniform display box while cell size drives resolution.
   */
  style?: CSSProperties;
}

/**
 * Renders a single Glyph to a `<canvas>` via the shared {@link renderGlyph}
 * renderer — the same code path the atlas compositor uses, so preview and
 * output match. Waits for the font to be ready before drawing so label
 * auto-shrink measures against the real font.
 */
export function GlyphPreview({
  label,
  cellSize = 128,
  background,
  foreground,
  fontFamily,
  symbolId,
  device,
  className,
  style,
}: GlyphPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glyphStyle = { background, foreground };

  // Warm the shared Render Source bitmap cache and redraw once it is ready. The
  // spec is passed unconditionally: even a label-only Glyph can carry tile art in
  // its Background, which needs warming just the same.
  const bitmapsVersion = useRenderSourceBitmaps(
    [{ symbolId, style: glyphStyle }],
    cellSize,
    device,
  );

  useGlyphCanvas(
    canvasRef,
    fontFamily,
    cellSize,
    (ctx) =>
      renderGlyph(ctx, 0, 0, {
        label,
        cellSize,
        style: glyphStyle,
        fontFamily,
        symbol: symbolId
          ? getSymbolBitmap(symbolId, glyphStyle, cellSize, device)
          : undefined,
        backgroundImage: getTileBitmap(glyphStyle, cellSize, device),
      }),
    [
      label,
      cellSize,
      background,
      foreground,
      fontFamily,
      symbolId,
      device,
      bitmapsVersion,
    ],
  );

  return (
    <canvas
      ref={canvasRef}
      width={cellSize}
      height={cellSize}
      role="img"
      aria-label={`Glyph preview for ${label}`}
      className={className}
      style={style}
    />
  );
}

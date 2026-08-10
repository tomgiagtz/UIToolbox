"use client";

import { useRef, type CSSProperties } from "react";
import { getTileBitmap } from "@/lib/glyph/background-render";
import { identityTransform } from "@/lib/glyph/defaults";
import { renderGlyph } from "@/lib/glyph/renderer";
import { getSymbolBitmap } from "@/lib/glyph/symbol-render";
import type { ContentLayer, SymbolPaints } from "@/lib/glyph/style";
import type { Background } from "@/lib/glyph/types";
import { useGlyphCanvas } from "./use-glyph-canvas";
import { useRenderSourceBitmaps } from "./use-render-source-bitmaps";

export interface GlyphPreviewProps {
  label: string;
  cellSize?: number;
  textColor: string;
  background: Background;
  /**
   * Symbol Paint Role colours (fill / border / secondary) for a Symbol Render
   * Source. Defaults to the label `textColor` for all three roles when unset, so a
   * label-only or single-colour preview needs no extra props (ADR-0007 §3).
   */
  symbolPaints?: SymbolPaints;
  /**
   * How the content layer — whichever Render Source is drawn — is painted
   * (ADR-0012 §2). Defaults to identity, drawn upright at its natural size.
   */
  content?: ContentLayer;
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
  textColor,
  background,
  symbolPaints,
  content,
  fontFamily,
  symbolId,
  device,
  className,
  style,
}: GlyphPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glyphStyle = {
    textColor,
    background,
    symbolPaints: symbolPaints ?? {
      fill: textColor,
      border: textColor,
      secondary: textColor,
    },
    content: content ?? { transform: identityTransform() },
  };

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
      textColor,
      background,
      symbolPaints,
      content,
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

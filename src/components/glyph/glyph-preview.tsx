"use client";

import { useRef, type CSSProperties } from "react";
import { renderGlyph } from "@/lib/glyph/renderer";
import type { Background } from "@/lib/glyph/types";
import { useGlyphCanvas } from "./use-glyph-canvas";

export interface GlyphPreviewProps {
  label: string;
  cellSize?: number;
  textColor: string;
  background: Background;
  /** Registered FontFace family name (or any CSS family for previews). */
  fontFamily: string;
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
  fontFamily,
  className,
  style,
}: GlyphPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useGlyphCanvas(
    canvasRef,
    fontFamily,
    cellSize,
    (ctx) => renderGlyph(ctx, 0, 0, { label, cellSize, textColor, background, fontFamily }),
    [label, cellSize, textColor, background, fontFamily],
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

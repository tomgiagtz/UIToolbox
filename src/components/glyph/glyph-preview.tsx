"use client";

import { useEffect, useRef } from "react";
import { renderGlyph } from "@/lib/glyph/renderer";
import type { Background } from "@/lib/glyph/types";

export interface GlyphPreviewProps {
  label: string;
  cellSize?: number;
  textColor: string;
  background: Background;
  /** Registered FontFace family name (or any CSS family for previews). */
  fontFamily: string;
  className?: string;
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
}: GlyphPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    const draw = () => {
      if (!cancelled) {
        renderGlyph(ctx, 0, 0, {
          label,
          cellSize,
          textColor,
          background,
          fontFamily,
        });
      }
    };

    if (typeof document !== "undefined" && "fonts" in document) {
      const probe = `${Math.floor(cellSize * 0.5)}px "${fontFamily}"`;
      document.fonts.load(probe).then(draw).catch(draw);
    } else {
      draw();
    }

    return () => {
      cancelled = true;
    };
  }, [label, cellSize, textColor, background, fontFamily]);

  return (
    <canvas
      ref={canvasRef}
      width={cellSize}
      height={cellSize}
      role="img"
      aria-label={`Glyph preview for ${label}`}
      className={className}
    />
  );
}

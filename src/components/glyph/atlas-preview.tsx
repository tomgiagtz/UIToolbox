"use client";

import { useRef } from "react";
import { gridPack } from "@/lib/glyph/packer";
import { renderGlyph } from "@/lib/glyph/renderer";
import type { GlyphStyle } from "@/lib/glyph/style";
import { useGlyphCanvas } from "./use-glyph-canvas";

/** One Glyph to draw in the preview: its label + cascade-resolved style. */
export interface PreviewGlyph {
  label: string;
  style: GlyphStyle;
}

export interface AtlasPreviewProps {
  /** Device the atlas belongs to; names the accessible label. */
  deviceName: string;
  /** Ordered Glyphs packed into the atlas, each already resolved to its style. */
  glyphs: PreviewGlyph[];
  cellSize: number;
  /** Registered FontFace family name (or any CSS family for previews). */
  fontFamily: string;
  className?: string;
}

/**
 * Renders a Device's live **packed Sprite Atlas** to a single `<canvas>`.
 *
 * Packs with the same {@link gridPack} and draws each cell with the same
 * {@link renderGlyph} the exporter's `renderAtlasBlob` compositor uses, so the
 * preview matches what Generate emits. The canvas is drawn at the real
 * power-of-two atlas resolution and scaled to fit its container via CSS, so the
 * preview stays sharp regardless of cell size.
 */
export function AtlasPreview({
  deviceName,
  glyphs,
  cellSize,
  fontFamily,
  className,
}: AtlasPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { atlasSize, placements } = gridPack(glyphs.length, cellSize);

  useGlyphCanvas(
    canvasRef,
    fontFamily,
    cellSize,
    (ctx) => {
      ctx.clearRect(0, 0, atlasSize.width, atlasSize.height);
      for (const { index, rect } of placements) {
        renderGlyph(ctx, rect.x, rect.y, {
          label: glyphs[index].label,
          cellSize,
          style: glyphs[index].style,
          fontFamily,
        });
      }
    },
    // `placements`/`atlasSize` derive from glyphs + cellSize, so those cover them.
    [glyphs, cellSize, fontFamily],
  );

  if (glyphs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {deviceName} has no Inputs to preview. Add some in the Inputs tab.
      </p>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={atlasSize.width}
      height={atlasSize.height}
      role="img"
      aria-label={`${deviceName} Sprite Atlas preview`}
      className={className}
    />
  );
}

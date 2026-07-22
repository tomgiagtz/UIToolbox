"use client";

import { useRef } from "react";
import { findPlacementIndexAt, gridPack } from "@/lib/glyph/packer";
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
  /**
   * Called with the index of the Glyph whose cell was clicked, so the editor can
   * select that Glyph and focus Glyph scope. When set, the canvas is clickable.
   */
  onSelectGlyph?: (index: number) => void;
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
  onSelectGlyph,
}: AtlasPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { placements } = gridPack(glyphs.length, cellSize);

  // The tight bounds of the packed cells. The exported texture is padded up to a
  // power of two, but that padding is empty — showing it here would letterbox the
  // glyphs off toward the top-left, so the preview canvas is sized to the content
  // instead, keeping the glyphs centered in the pane.
  const content = placements.reduce(
    (acc, { rect }) => ({
      width: Math.max(acc.width, rect.x + rect.w),
      height: Math.max(acc.height, rect.y + rect.h),
    }),
    { width: 1, height: 1 },
  );

  /**
   * Map a click on the CSS-scaled, `object-contain` canvas back to a Glyph index.
   * The canvas is drawn at the content resolution but letterboxed to fit its box,
   * so undo the fit-scale + centering offset before hit-testing.
   */
  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !onSelectGlyph) return;
    const box = canvas.getBoundingClientRect();
    const scale = Math.min(
      box.width / content.width,
      box.height / content.height,
    );
    if (scale <= 0) return;
    const drawnW = content.width * scale;
    const drawnH = content.height * scale;
    const x = (e.clientX - box.left - (box.width - drawnW) / 2) / scale;
    const y = (e.clientY - box.top - (box.height - drawnH) / 2) / scale;
    const index = findPlacementIndexAt(placements, x, y);
    if (index !== null) onSelectGlyph(index);
  }

  useGlyphCanvas(
    canvasRef,
    fontFamily,
    cellSize,
    (ctx) => {
      ctx.clearRect(0, 0, content.width, content.height);
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
      width={content.width}
      height={content.height}
      role="img"
      aria-label={`${deviceName} Sprite Atlas preview`}
      className={className}
      onClick={onSelectGlyph ? handleClick : undefined}
      title={onSelectGlyph ? "Click a cell to edit that Glyph" : undefined}
      style={onSelectGlyph ? { cursor: "pointer" } : undefined}
    />
  );
}

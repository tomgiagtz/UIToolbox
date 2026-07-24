"use client";

import { useRef, useState } from "react";
import { findPlacementIndexAt, gridPack } from "@/lib/glyph/packer";
import { renderGlyph } from "@/lib/glyph/renderer";
import type { GlyphStyle } from "@/lib/glyph/style";
import { getSymbolBitmap } from "@/lib/glyph/symbol-render";
import { useGlyphCanvas } from "./use-glyph-canvas";
import { useSymbolBitmaps } from "./use-symbol-bitmaps";

/** A hovered cell + its box relative to the canvas, driving the click highlight. */
interface Hover {
  index: number;
  rect: { left: number; top: number; width: number; height: number };
}

/** One Glyph to draw in the preview: its label + cascade-resolved style. */
export interface PreviewGlyph {
  label: string;
  style: GlyphStyle;
  /** Symbol id to draw as this Glyph's Render Source, or unset for the label. */
  symbolId?: string;
}

export interface AtlasPreviewProps {
  /** Device the atlas belongs to; names the accessible label. */
  deviceName: string;
  /** Ordered Glyphs packed into the atlas, each already resolved to its style. */
  glyphs: PreviewGlyph[];
  cellSize: number;
  /** Registered FontFace family name (or any CSS family for previews). */
  fontFamily: string;
  /** The Device's Catalog id, so a device-specific Symbol override resolves. */
  catalogId?: string;
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
  catalogId,
  className,
  onSelectGlyph,
}: AtlasPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const { placements } = gridPack(glyphs.length, cellSize);

  // Symbol Render Sources rasterize asynchronously; warm the shared cache and
  // redraw once ready (see `useSymbolBitmaps`).
  const symbolsVersion = useSymbolBitmaps(glyphs, cellSize, catalogId);

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
   * Resolve a pointer event to the cell under it. The canvas is drawn at the
   * content resolution but letterboxed by `object-contain` to fit its box, so
   * undo the fit-scale + centering offset before hit-testing. Returns the cell's
   * index plus its box in CSS pixels relative to the canvas (for the highlight),
   * or `null` when the pointer is in a gutter or the letterbox margin.
   */
  function hitTest(e: React.MouseEvent<HTMLCanvasElement>): Hover | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const box = canvas.getBoundingClientRect();
    const scale = Math.min(
      box.width / content.width,
      box.height / content.height,
    );
    if (scale <= 0) return null;
    const offsetX = (box.width - content.width * scale) / 2;
    const offsetY = (box.height - content.height * scale) / 2;
    const x = (e.clientX - box.left - offsetX) / scale;
    const y = (e.clientY - box.top - offsetY) / scale;
    const index = findPlacementIndexAt(placements, x, y);
    if (index === null) return null;
    const { rect } = placements[index];
    return {
      index,
      rect: {
        left: offsetX + rect.x * scale,
        top: offsetY + rect.y * scale,
        width: rect.w * scale,
        height: rect.h * scale,
      },
    };
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!onSelectGlyph) return;
    const hit = hitTest(e);
    if (hit) onSelectGlyph(hit.index);
  }

  function handleMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!onSelectGlyph) return;
    const hit = hitTest(e);
    // Only re-render when the hovered cell changes, not on every pixel of motion.
    // (Returning `prev` when the index is unchanged lets React bail out.)
    setHover((prev) =>
      hit === null ? null : prev?.index === hit.index ? prev : hit,
    );
  }

  useGlyphCanvas(
    canvasRef,
    fontFamily,
    cellSize,
    (ctx) => {
      ctx.clearRect(0, 0, content.width, content.height);
      for (const { index, rect } of placements) {
        const glyph = glyphs[index];
        renderGlyph(ctx, rect.x, rect.y, {
          label: glyph.label,
          cellSize,
          style: glyph.style,
          fontFamily,
          symbol: glyph.symbolId
            ? getSymbolBitmap(glyph.symbolId, glyph.style, cellSize, catalogId)
            : undefined,
        });
      }
    },
    // `placements`/`atlasSize` derive from glyphs + cellSize, so those cover them;
    // `symbolsVersion` re-runs the draw once async Symbol bitmaps are ready.
    [glyphs, cellSize, fontFamily, catalogId, symbolsVersion],
  );

  if (glyphs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {deviceName} has no Inputs to preview. Add some in the Inputs tab.
      </p>
    );
  }

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        width={content.width}
        height={content.height}
        role="img"
        aria-label={`${deviceName} Sprite Atlas preview`}
        className={className}
        onClick={onSelectGlyph ? handleClick : undefined}
        onMouseMove={onSelectGlyph ? handleMove : undefined}
        onMouseLeave={onSelectGlyph ? () => setHover(null) : undefined}
        title={onSelectGlyph ? "Click a cell to edit that Glyph" : undefined}
        style={onSelectGlyph ? { cursor: "pointer" } : undefined}
      />
      {onSelectGlyph && hover && (
        <div
          data-testid="glyph-hover-highlight"
          aria-hidden
          className="pointer-events-none absolute rounded-lg border-2 border-glyph-highlight-border bg-glyph-highlight-fill transition-[left,top,width,height] duration-75"
          style={hover.rect}
        />
      )}
    </div>
  );
}

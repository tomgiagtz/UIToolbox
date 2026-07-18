"use client";

import { useRef } from "react";
import { gridPack } from "@/lib/glyph/packer";
import { renderGlyph } from "@/lib/glyph/renderer";
import type { Background } from "@/lib/glyph/types";
import { useGlyphCanvas } from "./use-glyph-canvas";

export interface AtlasPreviewProps {
  /** Device the atlas belongs to; names the accessible label. */
  deviceName: string;
  /** Ordered Input labels packed into the atlas, one Glyph each. */
  inputs: string[];
  cellSize: number;
  textColor: string;
  background: Background;
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
  inputs,
  cellSize,
  textColor,
  background,
  fontFamily,
  className,
}: AtlasPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { atlasSize, placements } = gridPack(inputs.length, cellSize);

  useGlyphCanvas(
    canvasRef,
    fontFamily,
    cellSize,
    (ctx) => {
      ctx.clearRect(0, 0, atlasSize.width, atlasSize.height);
      for (const { index, rect } of placements) {
        renderGlyph(ctx, rect.x, rect.y, {
          label: inputs[index],
          cellSize,
          textColor,
          background,
          fontFamily,
        });
      }
    },
    // `placements`/`atlasSize` derive from inputs + cellSize, so those cover them.
    [inputs, cellSize, textColor, background, fontFamily],
  );

  if (inputs.length === 0) {
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

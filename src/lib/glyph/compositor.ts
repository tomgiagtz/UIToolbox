import { renderGlyph } from "@/lib/glyph/renderer";
import type { DeviceOutput } from "@/lib/glyph/types";

export interface AtlasRenderInputs {
  /** Registered FontFace family name. */
  fontFamily: string;
}

/**
 * Composite a Device's Glyphs into its Sprite Atlas PNG.
 *
 * Uses an {@link OffscreenCanvas} sized to the (power-of-two) atlas and the
 * shared {@link renderGlyph} renderer, so the output is pixel-consistent with
 * the live preview. Each Glyph is drawn from its own cascade-resolved style
 * carried on the placement. Returns a PNG Blob.
 */
export async function renderAtlasBlob(
  output: DeviceOutput,
  inputs: AtlasRenderInputs,
): Promise<Blob> {
  const { width, height } = output.atlasSize;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to acquire an OffscreenCanvas 2D context.");
  }

  for (const placement of output.placements) {
    renderGlyph(ctx, placement.rect.x, placement.rect.y, {
      label: placement.label,
      cellSize: output.cellSize,
      style: placement.style,
      fontFamily: inputs.fontFamily,
    });
  }

  return canvas.convertToBlob({ type: "image/png" });
}

import { ensureTileBitmap } from "@/lib/glyph/background-render";
import { ensureImageBitmap } from "@/lib/glyph/images";
import { renderGlyph } from "@/lib/glyph/renderer";
import { ensureSymbolBitmap } from "@/lib/glyph/symbol-render";
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
    // Rasterize the Symbol Render Source (if any) to the resolved appearance
    // before drawing, so the exported atlas matches the live preview exactly.
    const symbol = placement.symbolId
      ? ((await ensureSymbolBitmap(
          placement.symbolId,
          placement.style,
          output.cellSize,
          output.catalogId,
        )) ?? undefined)
      : undefined;
    // A custom image Render Source rasterizes from the runtime registry, which the
    // editor fills on upload and on restore. Bytes missing here resolve to null
    // and the Glyph draws its label — only its *label*, since a placement carries
    // `imageId` or `symbolId` and never both. Keeping that from happening is the
    // loader's job: see `withAvailableImages`.
    const image = placement.imageId
      ? ((await ensureImageBitmap(placement.imageId, output.cellSize)) ??
        undefined)
      : undefined;
    // The Background tile — an Authored one recoloured from the placement's
    // resolved Background colours, or an uploaded image — rasterizes the same way,
    // so the exported atlas matches the live preview (#18, #22).
    const backgroundImage =
      (await ensureTileBitmap(
        placement.style,
        output.cellSize,
        output.catalogId,
      )) ?? undefined;
    renderGlyph(ctx, placement.rect.x, placement.rect.y, {
      label: placement.label,
      cellSize: output.cellSize,
      style: placement.style,
      fontFamily: inputs.fontFamily,
      symbol,
      image,
      backgroundImage,
    });
  }

  return canvas.convertToBlob({ type: "image/png" });
}

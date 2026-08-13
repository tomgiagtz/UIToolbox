import { ensureTileBitmap } from "@/lib/glyph/background-render";
import { ensureImageBitmap } from "@/lib/glyph/images";
import { renderGlyph } from "@/lib/glyph/renderer";
import { ensureSymbolBitmap } from "@/lib/glyph/symbol-render";
import type { DeviceOutput } from "@/lib/glyph/types";

/**
 * Composite a Device's Glyphs into its Sprite Atlas PNG.
 *
 * Uses an {@link OffscreenCanvas} sized to the (power-of-two) atlas and the
 * shared {@link renderGlyph} renderer, so the output is pixel-consistent with
 * the live preview. Each Glyph is drawn from its own cascade-resolved style
 * carried on the placement — the font included, so `output` is now the whole
 * input and there is nothing to thread beside it. Returns a PNG Blob.
 *
 * Registration is the caller's job: `ensureFamiliesRegistered` must have
 * resolved before this runs, or canvas quietly draws a lazily loaded family in
 * its fallback face.
 */
export async function renderAtlasBlob(output: DeviceOutput): Promise<Blob> {
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
    // editor fills on upload and on restore. An image whose bytes never arrived
    // resolves to null and the Glyph falls back to its Symbol or label.
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
      symbol,
      image,
      backgroundImage,
    });
  }

  return canvas.convertToBlob({ type: "image/png" });
}

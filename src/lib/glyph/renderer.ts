import type { GlyphStyle } from "@/lib/glyph/style";
import type { Background } from "@/lib/glyph/types";

/**
 * The subset of the 2D canvas context shared by the on-screen preview
 * (`CanvasRenderingContext2D`) and the off-screen atlas compositor
 * (`OffscreenCanvasRenderingContext2D`). Rendering through this type keeps
 * preview and output pixel-consistent.
 */
export type Canvas2DContext =
  CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface RenderGlyphOptions {
  label: string;
  /** Square cell edge length in px. */
  cellSize: number;
  /** Effective per-Glyph style (text color + Background) from the Style Cascade. */
  style: GlyphStyle;
  /** Registered FontFace family name. */
  fontFamily: string;
  /**
   * The Glyph's **Symbol** Render Source, already rasterized to its resolved
   * appearance (see `symbol-render.ts`). When present it is drawn on the tile in
   * place of the label; when absent the label is drawn (issue #17).
   */
  symbol?: CanvasImageSource;
  /**
   * The Glyph's **custom image** Render Source, already rasterized (see
   * `images.ts`). Outranks both the Symbol and the label, and is the one source
   * drawn at its own aspect rather than filling the square content box — it is
   * the user's own art, so it is never distorted (issue #20).
   */
  image?: CanvasImageSource;
  /**
   * The Glyph's **Background tile** art, already rasterized (see
   * `background-render.ts`): either an Authored Background recoloured to the
   * resolved Background colours, or an uploaded tile image. When present it is
   * drawn across the whole cell in place of the plain `shape` — the tile carries
   * its own shape + outline — with the label/Symbol composited on top (#18, #22).
   * Falls back to the plain `shape` while the bitmap is still warming, and is
   * ignored outright by a `none` source, which draws no background whatsoever.
   */
  backgroundImage?: CanvasImageSource;
}

const MAX_FONT_FRACTION = 0.5;
const MIN_FONT_PX = 8;

/**
 * Draw one Glyph — its Background (tile art, a drawn shape, or nothing at all),
 * then a centered, single-line, auto-shrunk label — into the `cellSize`×`cellSize`
 * region whose top-left corner is (`ox`, `oy`).
 *
 * Shared by the live preview and the atlas compositor so both render
 * identically.
 */
export function renderGlyph(
  ctx: Canvas2DContext,
  ox: number,
  oy: number,
  opts: RenderGlyphOptions,
): void {
  const { cellSize, style, fontFamily, label, symbol, image, backgroundImage } =
    opts;
  const { background, textColor } = style;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.clearRect(0, 0, cellSize, cellSize);

  // A "none" source draws nothing behind the content at all — no primitive and
  // no tile art. Otherwise a tile (Authored or uploaded) replaces the plain shape
  // and carries its own outline; until its bitmap warms, fall back to the plain
  // shape so there's no blank flash.
  if (background.source.kind !== "none") {
    if (backgroundImage) {
      drawTile(ctx, cellSize, backgroundImage, background.source);
    } else {
      drawBackground(ctx, cellSize, background);
    }
  }
  // Exactly one Render Source is drawn, in the same content box: a custom image,
  // else a Symbol, else the label. The order is also the fallback chain — a source
  // whose bitmap hasn't loaded (or never will) shows the next one down rather
  // than an empty cell.
  const box = contentBox(cellSize, background.border.width, style.contentScale);
  if (box.size > 0) {
    // A content scale above 1 can reach past the cell, and cells are packed
    // edge-to-edge, so clip before drawing or a big Glyph paints its neighbour.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cellSize, cellSize);
    ctx.clip();
    if (image) {
      drawImage(ctx, cellSize, image, box.size);
    } else if (symbol) {
      drawSymbol(ctx, cellSize, symbol, box.size);
    } else {
      drawLabel(
        ctx,
        cellSize,
        label,
        textColor,
        fontFamily,
        box.size,
        style.contentScale,
      );
    }
    ctx.restore();
  }

  ctx.restore();
}

/**
 * The inner box a Render Source draws in: an unscaled padding that keeps the
 * content clear of the border and cell edge, then the user's `contentScale` on the
 * resulting square. Shared by all three sources so a Symbol, a custom image, and
 * the fallback label occupy the exact same footprint.
 *
 * The scale is applied to the box rather than the padding so the box stays centred
 * on the cell — every source re-centres from {@link size} alone.
 */
function contentBox(
  cellSize: number,
  borderWidth: number,
  contentScale: number,
): { size: number } {
  const padding = Math.max(borderWidth + 4, cellSize * 0.12);
  return { size: (cellSize - padding * 2) * contentScale };
}

/**
 * Draw the Background tile art across the whole cell.
 *
 * The two kinds of art get the treatment their authorship earns. An **Authored
 * Background** is square, tool-owned tile art, so it fills the cell exactly and
 * honours the mirror flag that faces left-side bumpers/triggers the other way
 * (issue #18) — the flip wraps only the tile, so the content drawn on top stays
 * upright. An **uploaded image** is the user's own graphic of unknown aspect, so
 * it is fitted and centred rather than stretched (issue #22).
 */
function drawTile(
  ctx: Canvas2DContext,
  cellSize: number,
  tile: CanvasImageSource,
  source: Background["source"],
): void {
  if (source.kind === "image") {
    drawImage(ctx, cellSize, tile, cellSize);
    return;
  }
  if (source.kind === "authored" && source.flipX) {
    ctx.save();
    ctx.translate(cellSize, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(tile, 0, 0, cellSize, cellSize);
    ctx.restore();
    return;
  }
  ctx.drawImage(tile, 0, 0, cellSize, cellSize);
}

/**
 * Draw a rasterized Symbol centred in the tile's content box, preserving its
 * square aspect.
 */
function drawSymbol(
  ctx: Canvas2DContext,
  cellSize: number,
  symbol: CanvasImageSource,
  size: number,
): void {
  const offset = (cellSize - size) / 2;
  ctx.drawImage(symbol, offset, offset, size, size);
}

/**
 * Draw a rasterized user image centred in a `size`-square box, **fitted** to its
 * own aspect: the user's art is arbitrary, so it is letterboxed inside the box
 * rather than stretched to fill it. A source reporting no intrinsic size falls back
 * to filling the box. Shared by the custom image Render Source (the content box)
 * and an uploaded Background tile (the whole cell).
 */
function drawImage(
  ctx: Canvas2DContext,
  cellSize: number,
  image: CanvasImageSource,
  size: number,
): void {
  const natural = intrinsicSize(image);
  const fit = natural ? size / Math.max(natural.width, natural.height) : 0;
  const width = natural ? natural.width * fit : size;
  const height = natural ? natural.height * fit : size;
  ctx.drawImage(
    image,
    (cellSize - width) / 2,
    (cellSize - height) / 2,
    width,
    height,
  );
}

/** An image source's intrinsic pixel size, or `null` if it reports none. */
function intrinsicSize(
  image: CanvasImageSource,
): { width: number; height: number } | null {
  const { width, height } = image as { width?: unknown; height?: unknown };
  return typeof width === "number" &&
    typeof height === "number" &&
    width > 0 &&
    height > 0
    ? { width, height }
    : null;
}

function drawBackground(
  ctx: Canvas2DContext,
  cellSize: number,
  bg: Background,
): void {
  const bw = bg.border.width;
  const inset = bw / 2;
  const x = inset;
  const y = inset;
  const size = cellSize - bw;

  ctx.beginPath();
  switch (bg.shape) {
    case "square":
      ctx.rect(x, y, size, size);
      break;
    case "rounded-rect": {
      const r = Math.min(bg.cornerRadius, size / 2);
      ctx.roundRect(x, y, size, size, r);
      break;
    }
    case "circle": {
      const cx = cellSize / 2;
      const cy = cellSize / 2;
      const radius = (cellSize - bw) / 2;
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      break;
    }
  }

  ctx.fillStyle = bg.fill;
  ctx.fill();

  if (bw > 0) {
    ctx.lineWidth = bw;
    ctx.strokeStyle = bg.border.color;
    ctx.stroke();
  }
}

function drawLabel(
  ctx: Canvas2DContext,
  cellSize: number,
  label: string,
  color: string,
  fontFamily: string,
  available: number,
  contentScale: number,
): void {
  if (!label) return;

  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // The content scale widens the box the label must fit, but it also has to move
  // the starting size — otherwise scaling up would only loosen the fit for a
  // long label and do nothing at all for a short one.
  let fontPx = Math.floor(cellSize * MAX_FONT_FRACTION * contentScale);
  const font = (px: number) => `${px}px "${fontFamily}"`;

  ctx.font = font(fontPx);
  let width = ctx.measureText(label).width;
  while (width > available && fontPx > MIN_FONT_PX) {
    // Shrink proportionally toward the target width, then step down to be safe.
    const next = Math.max(
      MIN_FONT_PX,
      Math.min(fontPx - 1, Math.floor((fontPx * available) / width)),
    );
    fontPx = next;
    ctx.font = font(fontPx);
    width = ctx.measureText(label).width;
  }

  ctx.fillText(label, cellSize / 2, cellSize / 2);
}

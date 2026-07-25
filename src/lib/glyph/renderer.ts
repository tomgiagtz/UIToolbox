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
   * The Glyph's **Authored Background** tile, already rasterized to its resolved
   * Background colours (see `symbol-render.ts`). When present it is drawn across the
   * whole cell in place of the plain `shape` — the tile carries its own shape +
   * outline — with the label/Symbol composited on top (issue #18). Falls back to the
   * plain `shape` while the bitmap is still warming.
   */
  backgroundImage?: CanvasImageSource;
}

const MAX_FONT_FRACTION = 0.5;
const MIN_FONT_PX = 8;

/**
 * Draw one Glyph — Background shape + fill + border, then a centered,
 * single-line, auto-shrunk label — into the `cellSize`×`cellSize` region whose
 * top-left corner is (`ox`, `oy`).
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
  const { cellSize, style, fontFamily, label, symbol, backgroundImage } = opts;
  const { background, textColor } = style;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.clearRect(0, 0, cellSize, cellSize);

  // An Authored Background tile replaces the plain shape and carries its own outline.
  // Until its bitmap warms, fall back to the plain shape so there's no blank flash.
  if (backgroundImage) {
    // Mirror left-side tiles horizontally so they face opposite the right-side
    // ones that share the same right-facing art (issue #18). The flip wraps only
    // the tile draw, so the label below stays upright.
    if (background.flipX) {
      ctx.save();
      ctx.translate(cellSize, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(backgroundImage, 0, 0, cellSize, cellSize);
      ctx.restore();
    } else {
      ctx.drawImage(backgroundImage, 0, 0, cellSize, cellSize);
    }
  } else {
    drawBackground(ctx, cellSize, background);
  }
  // A Symbol Render Source replaces the label; both share the same content box.
  if (symbol) {
    drawSymbol(ctx, cellSize, symbol, background.border.width);
  } else {
    drawLabel(
      ctx,
      cellSize,
      label,
      textColor,
      fontFamily,
      background.border.width,
    );
  }

  ctx.restore();
}

/**
 * The inner box a Render Source draws in: the padding that keeps a Symbol or label
 * clear of the border and cell edge, and the resulting square edge length. Shared
 * so a Symbol and its fallback label occupy the exact same footprint.
 */
function contentBox(
  cellSize: number,
  borderWidth: number,
): { padding: number; size: number } {
  const padding = Math.max(borderWidth + 4, cellSize * 0.12);
  return { padding, size: cellSize - padding * 2 };
}

/**
 * Draw a rasterized Symbol centred in the tile's content box, preserving its
 * square aspect.
 */
function drawSymbol(
  ctx: Canvas2DContext,
  cellSize: number,
  symbol: CanvasImageSource,
  borderWidth: number,
): void {
  const { padding, size } = contentBox(cellSize, borderWidth);
  if (size <= 0) return;
  ctx.drawImage(symbol, padding, padding, size, size);
}

function drawBackground(
  ctx: Canvas2DContext,
  cellSize: number,
  bg: Background,
): void {
  if (bg.shape === "none") return;

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
  borderWidth: number,
): void {
  if (!label) return;

  // Keep the label clear of the border and cell edge (same box as a Symbol).
  const { size: available } = contentBox(cellSize, borderWidth);

  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let fontPx = Math.floor(cellSize * MAX_FONT_FRACTION);
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

import type { GlyphStyle } from "@/lib/glyph/style";
import type { Background } from "@/lib/glyph/types";

/**
 * The subset of the 2D canvas context shared by the on-screen preview
 * (`CanvasRenderingContext2D`) and the off-screen atlas compositor
 * (`OffscreenCanvasRenderingContext2D`). Rendering through this type keeps
 * preview and output pixel-consistent.
 */
export type Canvas2DContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export interface RenderGlyphOptions {
  label: string;
  /** Square cell edge length in px. */
  cellSize: number;
  /** Effective per-Glyph style (text color + Background) from the Style Cascade. */
  style: GlyphStyle;
  /** Registered FontFace family name. */
  fontFamily: string;
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
  const { cellSize, style, fontFamily, label } = opts;
  const { background, textColor } = style;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.clearRect(0, 0, cellSize, cellSize);

  drawBackground(ctx, cellSize, background);
  drawLabel(ctx, cellSize, label, textColor, fontFamily, background.border.width);

  ctx.restore();
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

  // Keep the label clear of the border and cell edge.
  const padding = Math.max(borderWidth + 4, cellSize * 0.12);
  const available = cellSize - padding * 2;

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

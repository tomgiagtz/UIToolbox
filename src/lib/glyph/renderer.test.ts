import { describe, expect, it, vi } from "vitest";
import { renderGlyph, type Canvas2DContext } from "@/lib/glyph/renderer";
import type { GlyphStyle } from "@/lib/glyph/style";

/**
 * A minimal recording stub of the 2D context surface {@link renderGlyph} touches.
 * We only assert on the calls that distinguish the draw paths (the Authored
 * Background tile vs. the plain shape), so unrelated setters are no-ops.
 */
function fakeCtx() {
  const calls: string[] = [];
  const ctx = {
    save: vi.fn(() => calls.push("save")),
    restore: vi.fn(() => calls.push("restore")),
    translate: vi.fn(),
    scale: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(() => calls.push("beginPath")),
    rect: vi.fn(),
    roundRect: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(() => calls.push("fill")),
    stroke: vi.fn(),
    drawImage: vi.fn(() => calls.push("drawImage")),
    measureText: vi.fn(() => ({ width: 10 }) as TextMetrics),
    fillText: vi.fn(() => calls.push("fillText")),
  };
  return { ctx: ctx as unknown as Canvas2DContext, spies: ctx, calls };
}

const style: GlyphStyle = {
  textColor: "#ffffff",
  background: {
    shape: "rounded-rect",
    fill: "#0e7a0d",
    cornerRadius: 8,
    border: { width: 0, color: "#ffd400" },
    backgroundId: "bumper",
  },
  symbolPaints: { fill: "#ffffff", border: "#ffffff", secondary: "#ffffff" },
};

const base = { label: "RB", cellSize: 128, style, fontFamily: "TestFont" };

describe("renderGlyph — Authored Background tile (issue #18)", () => {
  it("draws the tile across the whole cell instead of the plain shape", () => {
    const { ctx, spies } = fakeCtx();
    const bitmap = {} as CanvasImageSource;
    renderGlyph(ctx, 0, 0, { ...base, backgroundImage: bitmap });

    expect(spies.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 128, 128);
    // The plain-shape path (fill of a beginPath'd shape) is skipped entirely.
    expect(spies.fill).not.toHaveBeenCalled();
    // The label still draws on top of the tile.
    expect(spies.fillText).toHaveBeenCalled();
  });

  it("mirrors the tile horizontally when flipX is set, leaving the label upright", () => {
    const { ctx, spies } = fakeCtx();
    const bitmap = {} as CanvasImageSource;
    const flipped: GlyphStyle = {
      ...style,
      background: { ...style.background, flipX: true },
    };
    renderGlyph(ctx, 0, 0, {
      ...base,
      style: flipped,
      backgroundImage: bitmap,
    });

    // A horizontal mirror: shift right by the cell width, then scale x by -1.
    expect(spies.translate).toHaveBeenCalledWith(128, 0);
    expect(spies.scale).toHaveBeenCalledWith(-1, 1);
    expect(spies.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 128, 128);
    // The label still draws (upright, outside the flipped save/restore).
    expect(spies.fillText).toHaveBeenCalled();
  });

  it("falls back to the plain shape while the tile bitmap is still warming", () => {
    const { ctx, spies, calls } = fakeCtx();
    renderGlyph(ctx, 0, 0, base); // no backgroundImage yet

    // Shape path runs (a filled beginPath), and no tile image is drawn.
    expect(calls).toContain("fill");
    expect(spies.drawImage).not.toHaveBeenCalled();
  });
});

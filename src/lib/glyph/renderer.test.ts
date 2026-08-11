import { describe, expect, it, vi } from "vitest";
import { renderGlyph, type Canvas2DContext } from "@/lib/glyph/renderer";
import type { GlyphStyle } from "@/lib/glyph/style";
import { identityTransform } from "@/lib/glyph/defaults";

/**
 * A minimal recording stub of the 2D context surface {@link renderGlyph} touches.
 * We only assert on the calls that distinguish the draw paths (the Authored
 * Background tile vs. the plain shape), so unrelated setters are no-ops.
 */
function fakeCtx() {
  const calls: string[] = [];
  const ctx = {
    // Written by the label path; read back to assert the resolved font size.
    font: "",
    save: vi.fn(() => calls.push("save")),
    restore: vi.fn(() => calls.push("restore")),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(() => calls.push("beginPath")),
    clip: vi.fn(() => calls.push("clip")),
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
  background: {
    source: { kind: "authored", backgroundId: "bumper" },
    transform: identityTransform(),
    shape: "rounded-rect",
    fill: "#0e7a0d",
    cornerRadius: 8,
    border: { width: 0, color: "#ffd400" },
  },
  foreground: {
    transform: identityTransform(),
    textColor: "#ffffff",
    symbolPaints: { fill: "#ffffff", border: "#ffffff", secondary: "#ffffff" },
  },
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

  it("draws the tile inside the cell clip so a transform can't reach a neighbour", () => {
    // Cells are packed edge-to-edge, and a rotated or upscaled tile is bigger
    // than its cell — so unlike before, the tile draw is clipped too.
    const { ctx, calls } = fakeCtx();
    renderGlyph(ctx, 0, 0, {
      ...base,
      backgroundImage: {} as CanvasImageSource,
    });

    expect(calls.indexOf("clip")).toBeLessThan(calls.indexOf("drawImage"));
  });
});

describe("renderGlyph — the two layer transforms (ADR-0012 §2)", () => {
  /** Face the tile the other way, as a left-side shoulder's seed does. */
  const mirrored: GlyphStyle = {
    ...style,
    background: {
      ...style.background,
      transform: { rotation: 0, scale: { x: -1, y: 1 } },
    },
  };

  it("mirrors the tile about the cell centre, leaving the label upright", () => {
    const { ctx, spies } = fakeCtx();
    const bitmap = {} as CanvasImageSource;
    renderGlyph(ctx, 0, 0, {
      ...base,
      style: mirrored,
      backgroundImage: bitmap,
    });

    // Transformed about the centre rather than an edge, so a mirror and a
    // rotation share one origin: in to the centre, transform, back out.
    expect(spies.translate).toHaveBeenCalledWith(64, 64);
    expect(spies.scale).toHaveBeenCalledWith(-1, 1);
    expect(spies.translate).toHaveBeenCalledWith(-64, -64);
    expect(spies.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 128, 128);
    // The content layer knows nothing about it, so the label is not written
    // backwards — what `flipX` bought by wrapping only the tile.
    expect(spies.scale).not.toHaveBeenCalledWith(1, -1);
    expect(spies.fillText).toHaveBeenCalledWith("RB", 64, 64);
  });

  it("mirrors a drawn primitive too, not just tile art", () => {
    // `flipX` was meaningful for exactly one source kind; a layer transform is
    // not. With no bitmap warmed, the shape path draws inside the same one.
    const { ctx, spies, calls } = fakeCtx();
    renderGlyph(ctx, 0, 0, { ...base, style: mirrored });

    expect(calls).toContain("fill");
    expect(spies.scale).toHaveBeenCalledWith(-1, 1);
  });

  it("rotates each layer by its own angle, in radians", () => {
    const { ctx, spies } = fakeCtx();
    const turned: GlyphStyle = {
      ...style,
      background: {
        ...style.background,
        transform: { rotation: 90, scale: { x: 1, y: 1 } },
      },
      foreground: {
        ...style.foreground,
        transform: { rotation: 180, scale: { x: 1, y: 1 } },
      },
    };
    renderGlyph(ctx, 0, 0, { ...base, style: turned });

    expect(spies.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(spies.rotate).toHaveBeenCalledWith(Math.PI);
  });

  it("rotates before it scales, so a mirror stays a mirror under a rotation", () => {
    // Order is load-bearing for the seeded shoulders (ADR-0012 §2): rotating
    // first mirrors the art along its own axis, so `scale.x: -1` still means
    // "this control faces the other way" at 90°. Scaling first would mirror
    // along the cell's horizontal and flip a turned bumper end-for-end.
    const { ctx, spies } = fakeCtx();
    const order: string[] = [];
    vi.mocked(spies.rotate).mockImplementation(() => order.push("rotate"));
    vi.mocked(spies.scale).mockImplementation(() => order.push("scale"));
    renderGlyph(ctx, 0, 0, {
      ...base,
      style: {
        ...style,
        background: {
          ...style.background,
          transform: { rotation: 90, scale: { x: -1, y: 1 } },
        },
      },
    });

    expect(order.slice(0, 2)).toEqual(["rotate", "scale"]);
  });

  it("leaves an untransformed Glyph drawn exactly where it always was", () => {
    const { ctx, spies } = fakeCtx();
    renderGlyph(ctx, 0, 0, base);

    expect(spies.rotate).toHaveBeenCalledWith(0);
    expect(spies.scale).toHaveBeenCalledWith(1, 1);
    expect(spies.fillText).toHaveBeenCalledWith("RB", 64, 64);
  });

  it("falls back to the plain shape while the tile bitmap is still warming", () => {
    const { ctx, spies, calls } = fakeCtx();
    renderGlyph(ctx, 0, 0, base); // no backgroundImage yet

    // Shape path runs (a filled beginPath), and no tile image is drawn.
    expect(calls).toContain("fill");
    expect(spies.drawImage).not.toHaveBeenCalled();
  });
});

describe('renderGlyph — a "none" Background source', () => {
  const none: GlyphStyle = {
    ...style,
    background: { ...style.background, source: { kind: "none" } },
  };

  it("draws no background at all, but still draws the content", () => {
    const { ctx, spies, calls } = fakeCtx();
    renderGlyph(ctx, 0, 0, { ...base, style: none });

    // No filled primitive — contrast with the plain-shape fallback above.
    expect(calls).not.toContain("fill");
    expect(spies.drawImage).not.toHaveBeenCalled();
    // The Glyph is transparent behind its content, not empty.
    expect(spies.fillText).toHaveBeenCalled();
  });

  it("ignores a tile bitmap it is handed anyway", () => {
    const { ctx, spies, calls } = fakeCtx();
    renderGlyph(ctx, 0, 0, {
      ...base,
      style: none,
      backgroundImage: {} as CanvasImageSource,
    });

    // "Nothing is drawn" is decided before the tile-vs-shape branch, not inside
    // the shape path — so a stale bitmap can't put a background back.
    expect(spies.drawImage).not.toHaveBeenCalled();
    expect(calls).not.toContain("fill");
  });
});

// The content box the renderer draws a Render Source in, at cellSize 128 with no
// border: `cellSize - 2 * max(borderWidth + 4, cellSize * 0.12)`. Restated here so
// the geometry assertions below fail loudly if that box ever moves.
const BOX = 128 - 2 * Math.max(0 + 4, 128 * 0.12);

/** A stand-in bitmap with intrinsic dimensions, as `ImageBitmap` reports them. */
function bitmapOf(width: number, height: number): CanvasImageSource {
  return { width, height } as unknown as CanvasImageSource;
}

describe("renderGlyph — uploaded Background tile (issue #22)", () => {
  /** The same style, with an uploaded image as the Background source. */
  const uploaded: GlyphStyle = {
    ...style,
    background: {
      ...style.background,
      source: { kind: "image", imageId: "img-1.png" },
    },
  };

  it("fits the tile to the whole cell, preserving the image's aspect", () => {
    const { ctx, spies } = fakeCtx();
    // A wide tile: fitted to the cell width, centred vertically — not stretched
    // to the square an Authored Background would fill.
    const tile = bitmapOf(200, 100);
    renderGlyph(ctx, 0, 0, {
      ...base,
      style: uploaded,
      backgroundImage: tile,
    });

    expect(spies.drawImage).toHaveBeenCalledWith(tile, 0, 32, 128, 64);
    // It replaces the plain shape, and the label still draws on top.
    expect(spies.fill).not.toHaveBeenCalled();
    expect(spies.fillText).toHaveBeenCalled();
  });

  it("mirrors an uploaded tile too — the transform is the layer's, not the art's", () => {
    // The reversal of `flipX`, which was meaningful for exactly one source kind
    // (ADR-0009 → ADR-0012 §2). An uploaded tile now takes the same transform.
    const { ctx, spies } = fakeCtx();
    renderGlyph(ctx, 0, 0, {
      ...base,
      style: {
        ...uploaded,
        background: {
          ...uploaded.background,
          transform: { rotation: 0, scale: { x: -1, y: 1 } },
        },
      },
      backgroundImage: bitmapOf(128, 128),
    });

    expect(spies.scale).toHaveBeenCalledWith(-1, 1);
  });

  it("falls back to the plain shape when the image has no bytes to draw", () => {
    const { ctx, spies, calls } = fakeCtx();
    renderGlyph(ctx, 0, 0, { ...base, style: uploaded });

    expect(calls).toContain("fill");
    expect(spies.drawImage).not.toHaveBeenCalled();
  });
});

describe("renderGlyph — custom image Render Source (issue #20)", () => {
  it("draws a square image filling the same content box a Symbol uses", () => {
    const { ctx, spies } = fakeCtx();
    const image = bitmapOf(64, 64);
    renderGlyph(ctx, 0, 0, { ...base, image });

    const offset = (128 - BOX) / 2;
    expect(spies.drawImage).toHaveBeenCalledWith(
      image,
      offset,
      offset,
      BOX,
      BOX,
    );
    // The label is replaced, not drawn underneath.
    expect(spies.fillText).not.toHaveBeenCalled();
  });

  it("letterboxes a wide image rather than distorting it", () => {
    const { ctx, spies } = fakeCtx();
    const image = bitmapOf(200, 100);
    renderGlyph(ctx, 0, 0, { ...base, image });

    const height = BOX / 2;
    expect(spies.drawImage).toHaveBeenCalledWith(
      image,
      (128 - BOX) / 2,
      (128 - height) / 2,
      BOX,
      height,
    );
  });

  it("clips to the cell so an oversized image can't bleed into its neighbour", () => {
    const { ctx, spies } = fakeCtx();
    renderGlyph(ctx, 0, 0, {
      ...base,
      style: {
        ...style,
        foreground: {
          ...style.foreground,
          transform: { rotation: 0, scale: { x: 2, y: 2 } },
        },
      },
      image: bitmapOf(64, 64),
    });

    expect(spies.rect).toHaveBeenCalledWith(0, 0, 128, 128);
    expect(spies.clip).toHaveBeenCalled();
  });

  it("takes precedence over a Symbol, which takes precedence over the label", () => {
    const symbol = bitmapOf(64, 64);
    // Wide, so the letterboxed height identifies the image in the draw call —
    // two same-sized stubs would be indistinguishable to a structural matcher.
    const image = bitmapOf(200, 100);

    const both = fakeCtx();
    renderGlyph(both.ctx, 0, 0, { ...base, symbol, image });
    expect(both.spies.drawImage).toHaveBeenCalledTimes(1);
    expect(both.spies.drawImage).toHaveBeenCalledWith(
      image,
      (128 - BOX) / 2,
      (128 - BOX / 2) / 2,
      BOX,
      BOX / 2,
    );

    // With the image's bytes still missing, the Symbol draws — and with neither,
    // the label. Each source degrades to the next rather than blanking the cell.
    const symbolOnly = fakeCtx();
    renderGlyph(symbolOnly.ctx, 0, 0, { ...base, symbol });
    expect(symbolOnly.spies.drawImage).toHaveBeenCalled();
    expect(symbolOnly.spies.fillText).not.toHaveBeenCalled();

    const labelOnly = fakeCtx();
    renderGlyph(labelOnly.ctx, 0, 0, base);
    expect(labelOnly.spies.fillText).toHaveBeenCalled();
  });
});

describe("renderGlyph — scaling the content layer", () => {
  /** Half width only — a stretch the old uniform scale could not ask for. */
  const squashed: GlyphStyle = {
    ...style,
    foreground: {
      ...style.foreground,
      transform: { rotation: 0, scale: { x: 0.5, y: 1 } },
    },
  };

  it("scales the layer rather than each source's own geometry", () => {
    // Every source still draws the identity-sized box it always did, and the
    // canvas transform shrinks it — one mechanism for the whole transform, so
    // scale and rotation can't come to disagree about a source kind.
    const { ctx, spies } = fakeCtx();
    const symbol = bitmapOf(64, 64);
    renderGlyph(ctx, 0, 0, { ...base, style: squashed, symbol });

    const offset = (128 - BOX) / 2;
    expect(spies.drawImage).toHaveBeenCalledWith(
      symbol,
      offset,
      offset,
      BOX,
      BOX,
    );
    expect(spies.scale).toHaveBeenCalledWith(0.5, 1);
  });

  it("stretches a custom image, which the renderer no longer refuses to do", () => {
    // `drawImage` still fits the user's art to its own aspect: the renderer
    // never distorts on its own initiative. A per-axis scale is the user
    // asking, so it rides on the layer instead (ADR-0012 §2).
    const { ctx, spies } = fakeCtx();
    const image = bitmapOf(200, 100);
    renderGlyph(ctx, 0, 0, { ...base, style: squashed, image });

    expect(spies.drawImage).toHaveBeenCalledWith(
      image,
      (128 - BOX) / 2,
      (128 - BOX / 2) / 2,
      BOX,
      BOX / 2,
    );
    expect(spies.scale).toHaveBeenCalledWith(0.5, 1);
  });

  it("draws the label at its natural size, centred, and scales that", () => {
    // The stub measures every string at 10px wide, so nothing auto-shrinks and
    // the font is the starting size — no longer a function of the scale.
    const { ctx, spies } = fakeCtx();
    renderGlyph(ctx, 0, 0, { ...base, style: squashed });

    expect(spies.font).toBe(`${Math.floor(128 * 0.5)}px "TestFont"`);
    expect(spies.fillText).toHaveBeenCalledWith("RB", 64, 64);
    expect(spies.scale).toHaveBeenCalledWith(0.5, 1);
  });
});

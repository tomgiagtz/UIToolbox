import { describe, expect, it } from "vitest";
import {
  findPlacementIndexAt,
  gridPack,
  GUTTER,
  isPowerOfTwo,
  nextPowerOfTwo,
} from "@/lib/glyph/packer";

describe("nextPowerOfTwo", () => {
  it("returns the same value for exact powers of two", () => {
    for (const n of [1, 2, 4, 128, 256, 1024]) {
      expect(nextPowerOfTwo(n)).toBe(n);
    }
  });

  it("rounds up to the next power of two", () => {
    expect(nextPowerOfTwo(3)).toBe(4);
    expect(nextPowerOfTwo(129)).toBe(256);
    expect(nextPowerOfTwo(130)).toBe(256);
  });

  it("never returns less than 1", () => {
    expect(nextPowerOfTwo(0)).toBe(1);
    expect(nextPowerOfTwo(-5)).toBe(1);
  });
});

describe("gridPack", () => {
  it("produces a power-of-two atlas on both axes", () => {
    const { atlasSize } = gridPack(7, 128);
    expect(isPowerOfTwo(atlasSize.width)).toBe(true);
    expect(isPowerOfTwo(atlasSize.height)).toBe(true);
  });

  it("makes the atlas large enough to contain every cell", () => {
    const count = 10;
    const cell = 128;
    const { atlasSize, placements } = gridPack(count, cell);
    expect(placements).toHaveLength(count);
    for (const p of placements) {
      expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(atlasSize.width);
      expect(p.rect.y + p.rect.h).toBeLessThanOrEqual(atlasSize.height);
      expect(p.rect.w).toBe(cell);
      expect(p.rect.h).toBe(cell);
    }
  });

  it("places cells on a uniform grid with a 2px gutter, non-overlapping", () => {
    const cell = 64;
    const { placements } = gridPack(9, cell);
    // Every rect is unique and no two overlap.
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const a = placements[i].rect;
        const b = placements[j].rect;
        const disjoint =
          a.x + a.w <= b.x ||
          b.x + b.w <= a.x ||
          a.y + a.h <= b.y ||
          b.y + b.h <= a.y;
        expect(disjoint).toBe(true);
      }
    }
    // Column step is cell + gutter.
    const step = cell + GUTTER;
    const xs = [...new Set(placements.map((p) => p.rect.x))].sort(
      (m, n) => m - n,
    );
    expect(xs[1] - xs[0]).toBe(step);
  });

  it("preserves input order via placement index", () => {
    const { placements } = gridPack(5, 128);
    expect(placements.map((p) => p.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("handles an empty set", () => {
    const { atlasSize, placements } = gridPack(0, 128);
    expect(placements).toHaveLength(0);
    expect(isPowerOfTwo(atlasSize.width)).toBe(true);
    expect(isPowerOfTwo(atlasSize.height)).toBe(true);
  });
});

describe("findPlacementIndexAt", () => {
  const { placements } = gridPack(5, 128);

  it("returns the index of the cell containing the point", () => {
    // Cell 0 sits at the origin; a point inside it hits index 0.
    expect(findPlacementIndexAt(placements, 10, 10)).toBe(0);
  });

  it("hits the correct cell for a point in a later column", () => {
    const step = 128 + GUTTER;
    // Just inside the second column's cell → index 1.
    expect(findPlacementIndexAt(placements, step + 5, 5)).toBe(1);
  });

  it("returns null for a point in the gutter between cells", () => {
    // The 2px gutter starts right at the first cell's far edge.
    expect(findPlacementIndexAt(placements, 129, 10)).toBeNull();
  });

  it("returns null for a point outside every cell", () => {
    expect(findPlacementIndexAt(placements, 100000, 100000)).toBeNull();
  });
});

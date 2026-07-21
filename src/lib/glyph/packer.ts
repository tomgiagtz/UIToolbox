import type { PackResult } from "@/lib/glyph/types";

/** Gutter between cells, in px (see spec: uniform grid, 2px gutter). */
export const GUTTER = 2;

/** Smallest power of two ≥ n, clamped to a minimum of 1. */
export function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

export function isPowerOfTwo(n: number): boolean {
  return n >= 1 && (n & (n - 1)) === 0;
}

/**
 * v1 Packer strategy: lay `count` uniform `cellSize` cells out on a roughly
 * square grid with a {@link GUTTER}px gutter, then pad each atlas dimension up
 * to the next power of two.
 *
 * Designed as a swappable strategy — variable-width shelf packing can replace
 * this later without touching the renderer or exporters.
 */
export function gridPack(count: number, cellSize: number): PackResult {
  if (count <= 0) {
    return { atlasSize: { width: 1, height: 1 }, placements: [] };
  }

  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const step = cellSize + GUTTER;

  const placements = Array.from({ length: count }, (_, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      index,
      rect: { x: col * step, y: row * step, w: cellSize, h: cellSize },
    };
  });

  // Content extent: last cell's far edge (no trailing gutter).
  const contentWidth = cols * cellSize + (cols - 1) * GUTTER;
  const contentHeight = rows * cellSize + (rows - 1) * GUTTER;

  return {
    atlasSize: {
      width: nextPowerOfTwo(contentWidth),
      height: nextPowerOfTwo(contentHeight),
    },
    placements,
  };
}

/**
 * The index of the placement whose cell rect contains atlas-space point
 * `(x, y)`, or `null` if the point falls in a gutter or outside every cell.
 * Used to turn a click on the atlas preview into a Glyph selection.
 */
export function findPlacementIndexAt(
  placements: PackResult["placements"],
  x: number,
  y: number,
): number | null {
  const hit = placements.find(
    ({ rect }) =>
      x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h,
  );
  return hit ? hit.index : null;
}

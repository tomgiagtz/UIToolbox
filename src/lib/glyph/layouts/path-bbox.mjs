/**
 * Bounding boxes for authored SVG geometry, used by `build-layouts.mjs` to place
 * an in-shape Symbol on pad Layout nodes whose art is an arbitrary `<path>` or
 * `<polygon>` (d-pads, bumpers, triggers, share/options).
 *
 * Only *on-path* points are measured — Bezier control points are skipped. A
 * control hull can bulge well outside the drawn shape, and we want a centre that
 * sits on the visible art, not on its mathematical envelope. That makes this an
 * approximation for curves: good enough to centre a Symbol, not a substitute for
 * `getBBox()` (which needs a live SVG document the build script doesn't have).
 */

/** Every number token: handles `1-2`, `.5.5` and exponent forms. */
const NUM = /-?\d*\.?\d+(?:[eE][-+]?\d+)?/g;

/** One number at the head of a parameter run, after any separators. */
const NUM_AT = /^[,\s]*(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/;

/**
 * One arc flag at the head of a parameter run. Flags are a single `0` or `1` and
 * may butt straight against the next value — optimisers emit `0 011 1` for
 * `0 0 1 1 1` — so they must be read one character at a time, not as numbers.
 */
const FLAG_AT = /^[,\s]*([01])/;

/** One path command letter plus its raw parameter run. */
const SEGMENT = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;

/** Parameters consumed per repetition of each command. */
const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };

/**
 * @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} BBox
 */

/** Split a flat parameter list into whole groups of `arity`, dropping any tail. */
function splitGroups(nums, arity) {
  const groups = [];
  for (let i = 0; i + arity <= nums.length; i += arity)
    groups.push(nums.slice(i, i + arity));
  return groups;
}

/**
 * Split an arc command's parameter run into `[rx, ry, rot, laf, sf, x, y]` groups.
 * Scans left to right so the two flags can be taken one character at a time —
 * `0 011 1` is four values, not two. Stops at the first incomplete group.
 */
function arcGroups(params) {
  const groups = [];
  let rest = params;
  for (;;) {
    const group = [];
    for (let i = 0; i < 7; i++) {
      // Parameters 3 and 4 are the large-arc and sweep flags.
      const match = (i === 3 || i === 4 ? FLAG_AT : NUM_AT).exec(rest);
      if (!match) return groups;
      group.push(Number(match[1]));
      rest = rest.slice(match[0].length);
    }
    groups.push(group);
  }
}

/** Accumulator over the points we visit. */
function tracker() {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    seen = false;
  return {
    add(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      seen = true;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    },
    /** @returns {BBox | undefined} */
    result() {
      return seen ? { minX, minY, maxX, maxY } : undefined;
    },
  };
}

/**
 * The bounding box of a `<path>`'s `d` attribute, or `undefined` if it holds no
 * usable coordinates.
 *
 * @param {string | undefined} d
 * @returns {BBox | undefined}
 */
export function pathBBox(d) {
  if (typeof d !== "string") return undefined;
  const box = tracker();
  // Current point, and the start of the current subpath for `Z`.
  let cx = 0,
    cy = 0,
    sx = 0,
    sy = 0;

  for (const [, cmd, params] of d.matchAll(SEGMENT)) {
    const up = cmd.toUpperCase();
    if (up === "Z") {
      cx = sx;
      cy = sy;
      continue;
    }
    const arity = ARITY[up];
    if (!arity) continue;
    const relative = cmd !== up;
    // Arcs need a scanner that reads their flags as single characters; every
    // other command splits cleanly on number tokens.
    const groups =
      up === "A"
        ? arcGroups(params)
        : splitGroups((params.match(NUM) ?? []).map(Number), arity);

    // A command letter may be followed by several parameter groups; each repeat
    // is another instance of the same command (and after `M`, an implicit line-to,
    // which is identical here since we only track the endpoint).
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      if (up === "H") {
        cx = relative ? cx + group[0] : group[0];
      } else if (up === "V") {
        cy = relative ? cy + group[0] : group[0];
      } else {
        // The endpoint is always the trailing pair; leading values are control
        // points (C/S/Q) or arc radii and flags (A), none of which lie on the path.
        const [ex, ey] = group.slice(-2);
        cx = relative ? cx + ex : ex;
        cy = relative ? cy + ey : ey;
      }
      box.add(cx, cy);
      if (up === "M" && i === 0) {
        sx = cx;
        sy = cy;
      }
    }
  }
  return box.result();
}

/**
 * The bounding box of a `<polygon>` / `<polyline>` `points` list, or `undefined`
 * if it holds no complete pair.
 *
 * @param {string | undefined} points
 * @returns {BBox | undefined}
 */
export function pointsBBox(points) {
  if (typeof points !== "string") return undefined;
  const nums = (points.match(NUM) ?? []).map(Number);
  const box = tracker();
  for (let i = 0; i + 2 <= nums.length; i += 2) box.add(nums[i], nums[i + 1]);
  return box.result();
}

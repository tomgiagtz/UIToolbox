// The RGB sentinel palette: the single source of truth mapping an authored paint
// *colour* to a tool paint role. Authors draw each shape in a pure primary that
// encodes the role it plays, so the classifier keys on colour — independent of
// fill-vs-stroke. (This replaces the old black-fill / stroke / white-fill
// heuristic, which mis-read black filled outlines as primary ink.)
//
//   red   #ff0000 → fill      (primary ink)
//   blue  #0000ff → border    (outline)
//   green #00ff00 → secondary (highlight)
//
// This is data + a pure classifier, no DOM or node deps, so both the dev preview
// (`preview-symbols.mjs`, which inlines it into the gallery's browser script) and
// the eventual tool colorization (issue #14) can share one mapping. See README.md.

/** @typedef {"fill" | "border" | "secondary"} PaintRole */

/**
 * Authored sentinel colour → paint role, in canonical order.
 * @type {{ hex: string, role: PaintRole }[]}
 */
export const PAINT_ROLE_PALETTE = [
  { hex: "#ff0000", role: "fill" }, // red   → fill (primary ink)
  { hex: "#0000ff", role: "border" }, // blue  → border (outline)
  { hex: "#00ff00", role: "secondary" }, // green → secondary (highlight)
];

/** @type {PaintRole[]} */
export const PAINT_ROLES = PAINT_ROLE_PALETTE.map((p) => p.role);

/** Role → its sentinel hex (used to seed the "authored" swatches). */
export const SENTINEL_HEX_BY_ROLE = Object.fromEntries(
  PAINT_ROLE_PALETTE.map((p) => [p.role, p.hex]),
);

/** Normalized sentinel hex → role. */
const ROLE_BY_HEX = Object.fromEntries(
  PAINT_ROLE_PALETTE.map((p) => [p.hex, p.role]),
);

/**
 * Normalize a CSS colour string to canonical lowercase `#rrggbb`, or `null` if
 * it isn't a plain opaque colour we can key on. Accepts `#rgb`, `#rrggbb`, and
 * `rgb()`/`rgba()` (the forms a design tool exports); alpha is ignored — the
 * sentinels are opaque and a role is about hue.
 * @param {string | null | undefined} color
 * @returns {string | null}
 */
export function normalizeHex(color) {
  if (!color) return null;
  const c = String(color).trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(c);
  if (hex) {
    const h = hex[1];
    return h.length === 3 ? "#" + [...h].map((x) => x + x).join("") : "#" + h;
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(c);
  if (rgb) {
    const to = (n) =>
      Math.max(0, Math.min(255, Number(n)))
        .toString(16)
        .padStart(2, "0");
    return "#" + to(rgb[1]) + to(rgb[2]) + to(rgb[3]);
  }
  return null;
}

/**
 * Classify an authored paint colour into a role, or `null` if it isn't a
 * sentinel (exact match after normalization — non-sentinel colours, including
 * the black art and invisible bounding boxes, are simply left unroled).
 * @param {string | null | undefined} color
 * @returns {PaintRole | null}
 */
export function classifyPaint(color) {
  const hex = normalizeHex(color);
  return hex ? (ROLE_BY_HEX[hex] ?? null) : null;
}

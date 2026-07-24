// The RGB sentinel palette: the single source of truth mapping an authored paint
// *colour* to a tool paint role. Authors draw each shape in a pure primary that
// encodes the role it plays, so the classifier keys on colour — independent of
// fill-vs-stroke.
//
//   red   #f00 (#ff0000) → fill      (primary ink)
//   blue  #00f (#0000ff) → border    (outline)
//   green #0f0 (#00ff00) → secondary (highlight)
//
// Matching is **exact** (after normalizing `#rgb`/`rgb()` shorthand). A shape's
// paint resolves to exactly one of three outcomes (see {@link inspectPaint}):
//   - **role**    — an exact sentinel; the tool recolours it per the Style Cascade.
//   - **ignore**  — `none`/`transparent`; renders nothing, carries no role.
//   - **unknown** — any other visible colour. It is NOT a role: the tool leaves it
//                   as authored (literal pass-through) and the caller **flags** it,
//                   so a mis-exported paint (e.g. an off-primary red) never fails
//                   silently. See ADR-0007.
//
// This is data + a pure classifier, no DOM or node deps, so the codegen
// (`build-symbols.mjs`), the dev preview (`preview-symbols.mjs`, which inlines it
// into the gallery's browser script), and the eventual in-app Symbol Set import
// all share one mapping. See README.md and docs/adr/0007-*.

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

/** Paint values that render nothing — carry no role and are never flagged. */
const IGNORED_PAINTS = new Set(["", "none", "transparent"]);

/**
 * Normalize a CSS colour string to canonical lowercase `#rrggbb`, or `null` if
 * it isn't a plain hex/`rgb()` colour we can key on. Accepts `#rgb`, `#rrggbb`,
 * and `rgb()`/`rgba()` (the forms a design tool exports); alpha is ignored — the
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
 * @typedef {{ kind: "role", role: PaintRole }
 *   | { kind: "ignore" }
 *   | { kind: "unknown", value: string }} PaintClass
 */

/**
 * Classify one authored paint value into exactly one outcome — `role`, `ignore`,
 * or `unknown` (see the module header). This is the "don't fail silently" core:
 * a visible colour that isn't a sentinel comes back as `unknown` (with its value)
 * so callers can flag it, rather than being quietly dropped.
 * @param {string | null | undefined} color
 * @returns {PaintClass}
 */
export function inspectPaint(color) {
  const c = String(color ?? "")
    .trim()
    .toLowerCase();
  if (IGNORED_PAINTS.has(c)) return { kind: "ignore" };
  const hex = normalizeHex(c);
  const role = hex ? ROLE_BY_HEX[hex] : undefined;
  return role ? { kind: "role", role } : { kind: "unknown", value: c };
}

/**
 * Convenience wrapper over {@link inspectPaint}: the sentinel role for a paint,
 * or `null` for both `ignore` and `unknown`. Use `inspectPaint` when you need to
 * distinguish "no paint" from "non-sentinel paint" (i.e. to flag).
 * @param {string | null | undefined} color
 * @returns {PaintRole | null}
 */
export function classifyPaint(color) {
  const res = inspectPaint(color);
  return res.kind === "role" ? res.role : null;
}

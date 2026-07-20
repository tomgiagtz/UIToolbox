// Codegen: parse the authored controller SVGs in this folder into the typed data
// module `pad-layouts.generated.ts`. Run with `npm run layouts`. See README.md.
//
// Lives in the project tree so ESM resolves `jsdom` from node_modules up-tree.
// The app/tests never run this — they import the generated output.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { LAYOUT_MAPPINGS } from "./mapping.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "pad-layouts.generated.ts");

/** Drawable SVG shapes we treat as candidate buttons / decoration. */
const DRAWABLES = "path, circle, ellipse, rect, polygon, polyline, line";

/** Geometry attributes to keep per element tag (everything else is dropped). */
const GEOM_ATTRS = {
  path: ["d"],
  circle: ["cx", "cy", "r"],
  ellipse: ["cx", "cy", "rx", "ry"],
  rect: ["x", "y", "width", "height", "rx", "ry"],
  polygon: ["points"],
  polyline: ["points"],
  line: ["x1", "y1", "x2", "y2"],
};

/** A shape's design-tool name: its `id`, falling back to `data-name`. */
function nameOf(el) {
  return el.getAttribute("id") || el.getAttribute("data-name") || "";
}

function num(el, attr) {
  const v = parseFloat(el.getAttribute(attr) ?? "");
  return Number.isFinite(v) ? v : undefined;
}

/**
 * A centre + radius for an in-shape label placeholder, for the simple shapes we
 * can measure cheaply and only when untransformed. Arbitrary paths get none.
 */
function labelAtOf(el, tag) {
  if (el.getAttribute("transform")) return undefined;
  if (tag === "circle") {
    const cx = num(el, "cx"),
      cy = num(el, "cy"),
      r = num(el, "r");
    if (cx != null && cy != null && r != null) return { x: cx, y: cy, r };
  } else if (tag === "ellipse") {
    const cx = num(el, "cx"),
      cy = num(el, "cy"),
      rx = num(el, "rx"),
      ry = num(el, "ry");
    if (cx != null && cy != null && rx != null && ry != null)
      return { x: cx, y: cy, r: Math.min(rx, ry) };
  } else if (tag === "rect") {
    const x = num(el, "x"),
      y = num(el, "y"),
      w = num(el, "width"),
      h = num(el, "height");
    if (x != null && y != null && w != null && h != null)
      return { x: x + w / 2, y: y + h / 2, r: Math.min(w, h) / 2 };
  }
  return undefined;
}

/** Read `viewBox` (or width/height) off the root `<svg>` as `{width,height}`. */
function viewBoxOf(root, file) {
  const vb = root.getAttribute("viewBox");
  if (vb) {
    const [, , w, h] = vb
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (Number.isFinite(w) && Number.isFinite(h))
      return { width: w, height: h };
  }
  const w = num(root, "width"),
    h = num(root, "height");
  if (w != null && h != null) return { width: w, height: h };
  throw new Error(`${file}: root <svg> needs a viewBox (or width/height).`);
}

/** Parse one controller SVG into a PadLayout, using its name→Catalog-id map. */
function parseLayout(controllerId, svgText, file) {
  const map = LAYOUT_MAPPINGS[controllerId] ?? {};
  const dom = new JSDOM(svgText, { contentType: "image/svg+xml" });
  const { document, XMLSerializer } = dom.window;
  const root = document.querySelector("svg");
  if (!root) throw new Error(`${file}: no root <svg> element.`);

  const viewBox = viewBoxOf(root, file);
  const mappedNames = new Set(Object.keys(map));
  const buttons = [];
  const seenCatalogIds = new Set();
  const foundNames = new Set();

  for (const el of root.querySelectorAll(DRAWABLES)) {
    const name = nameOf(el);
    if (!mappedNames.has(name)) continue; // decoration — handled below
    foundNames.add(name);
    const catalogId = map[name];
    if (seenCatalogIds.has(catalogId))
      throw new Error(`${file}: two shapes map to "${catalogId}".`);
    seenCatalogIds.add(catalogId);

    const tag = el.tagName.toLowerCase();
    const geom = {};
    for (const attr of GEOM_ATTRS[tag] ?? []) {
      const v = el.getAttribute(attr);
      if (v != null) geom[attr] = v;
    }
    const transform = el.getAttribute("transform");
    if (transform) geom.transform = transform;
    buttons.push({ id: catalogId, tag, geom, labelAt: labelAtOf(el, tag) });
  }

  // Every mapped name must exist in the SVG, or the map is stale.
  const missing = [...mappedNames].filter((n) => !foundNames.has(n));
  if (missing.length)
    throw new Error(
      `${file}: mapping names not found in SVG: ${missing.join(", ")}. ` +
        `Check the layer names / ids.`,
    );

  // Decoration = everything else, verbatim: clone the root, drop the buttons,
  // serialize the remaining children (outline, backers, defs) in document order.
  const clone = root.cloneNode(true);
  for (const el of clone.querySelectorAll(DRAWABLES)) {
    if (mappedNames.has(nameOf(el))) el.remove();
  }
  const serializer = new XMLSerializer();
  const decoration = Array.from(clone.childNodes)
    .map((n) => serializer.serializeToString(n))
    .join("")
    .trim();

  // Drop undefined labelAt so the JSON stays tidy.
  for (const b of buttons) if (!b.labelAt) delete b.labelAt;
  return { viewBox, decoration, buttons };
}

// --- Run -------------------------------------------------------------------

const svgs = readdirSync(HERE).filter((f) => f.endsWith(".svg"));
const layouts = {};
for (const file of svgs) {
  const controllerId = basename(file, ".svg");
  const svgText = readFileSync(join(HERE, file), "utf8");
  layouts[controllerId] = parseLayout(controllerId, svgText, file);
  console.log(
    `  ${controllerId}: ${layouts[controllerId].buttons.length} buttons`,
  );
}

const banner =
  "// GENERATED FILE — do not edit by hand.\n" +
  "// Regenerate with `npm run layouts` after changing an SVG in this folder or its\n" +
  "// entry in `mapping.mjs`. See `README.md`.\n\n" +
  'import type { PadLayout } from "@/lib/glyph/layout";\n\n' +
  "/**\n" +
  " * Authored pad Layouts, keyed by Catalog id, parsed from the SVGs in this folder.\n" +
  " * Empty until a controller SVG is exported and mapped; `getPadLayout` falls back\n" +
  " * to the code-drawn Layout for any pad not present here.\n" +
  " */\n";

const body = `export const AUTHORED_PAD_LAYOUTS: Record<string, PadLayout> = ${JSON.stringify(
  layouts,
  null,
  2,
)};\n`;

writeFileSync(OUT, banner + body);
console.log(
  `Wrote ${OUT} (${Object.keys(layouts).length} authored controller layout(s)).`,
);

// Codegen: window each authored `*-symbols.svg` atlas into standalone, square
// per-Symbol SVGs, generate the rotation-derived twins, and bake them plus the
// manifest into `symbols.generated.ts`. Run with `npm run symbols`. See README.md.
//
// Lives in the project tree so ESM resolves `jsdom` from node_modules up-tree.
// The app/tests never run this — they import the generated output.
//
// Authoring model: each shipped asset is a `<g id>` (or shape with an id) drawn
// *anywhere* on a fixed square grid, in the atlas's own absolute coordinates — the
// way a design tool exports. The codegen finds the grid cell each asset's bounding
// box is centred in and windows the standalone SVG's viewBox to that cell, leaving
// the art at its authored coordinates. No `translate(col,row)` convention needed.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { SYMBOL_MANIFEST } from "./manifest.mjs";
import { inspectPaint } from "./paint-roles.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "symbols.generated.ts");

/** Grid cell size in SVG units when an atlas omits `data-cell` on its root. */
const DEFAULT_CELL = 256;

const manifestById = new Map(SYMBOL_MANIFEST.map((a) => [a.id, a]));
const isDerived = (a) => a.rotateOf != null;

const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg"';

// --- Sentinel validation ("don't fail silently", ADR-0007) -------------------

const SHAPE_SEL = "path,circle,ellipse,rect,line,polygon,polyline";

/** Non-sentinel visible paints found while parsing — reported after the run. */
const nonSentinel = [];

/** A declared style/presentation prop off an element ("" when unspecified). */
function readProp(el, name) {
  const style = el.getAttribute?.("style") || "";
  const m = new RegExp("(?:^|;)\\s*" + name + "\\s*:\\s*([^;]+)").exec(style);
  return (m ? m[1] : el.getAttribute?.(name) || "").trim();
}

/** Whether a paint channel is switched off by opacity (renders nothing). */
function paintHidden(el, prop) {
  return (
    readProp(el, `${prop}-opacity`) === "0" || readProp(el, "opacity") === "0"
  );
}

/**
 * Record every visible non-sentinel fill/stroke under a cell. These aren't an
 * error (the shape keeps its authored colour), but they won't be role-colorable,
 * so we surface them — the usual cause is an off-primary export (e.g. `#f20d0d`
 * instead of the `#f00` fill sentinel).
 */
function collectNonSentinel(cellEl, assetId) {
  const shapes = [cellEl, ...cellEl.querySelectorAll(SHAPE_SEL)].filter((el) =>
    el.matches?.(SHAPE_SEL),
  );
  for (const el of shapes) {
    for (const prop of ["fill", "stroke"]) {
      if (paintHidden(el, prop)) continue;
      const res = inspectPaint(readProp(el, prop));
      if (res.kind === "unknown")
        nonSentinel.push({
          assetId,
          shapeId: el.getAttribute("id") || el.tagName,
          prop,
          value: res.value,
        });
    }
  }
}

// --- Bounding box (approximate, enough to snap art to its grid cell) ---------

/** Multiply two 2x3 affine matrices `[a,b,c,d,e,f]` (SVG order). */
function mul(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/** Apply an affine matrix to a point. */
const applyM = (m, x, y) => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

/** Parse an SVG `transform` list into a single affine matrix (identity if none). */
function toMatrix(transform) {
  let m = [1, 0, 0, 1, 0, 0];
  const re = /(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g;
  let match;
  while ((match = re.exec(transform ?? ""))) {
    const [, name, raw] = match;
    const a = raw
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => !Number.isNaN(n));
    let t = [1, 0, 0, 1, 0, 0];
    if (name === "matrix") t = a;
    else if (name === "translate") t = [1, 0, 0, 1, a[0] || 0, a[1] || 0];
    else if (name === "scale") t = [a[0] || 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (name === "rotate") {
      const r = ((a[0] || 0) * Math.PI) / 180;
      t = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
    }
    m = mul(m, t);
  }
  return m;
}

/** Coordinate pairs traced by a path `d`, control points included (bbox-approx). */
function pathPoints(d) {
  const pts = [];
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const counts = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  let i = 0;
  let cmd = "M";
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    if (up === "Z") {
      cx = sx;
      cy = sy;
      continue;
    }
    const n = counts[up] ?? 2;
    const a = [];
    for (let k = 0; k < n; k++) a.push(parseFloat(toks[i++]));
    if (up === "H") {
      cx = rel ? cx + a[0] : a[0];
      pts.push([cx, cy]);
    } else if (up === "V") {
      cy = rel ? cy + a[0] : a[0];
      pts.push([cx, cy]);
    } else if (up === "A") {
      cx = rel ? cx + a[5] : a[5];
      cy = rel ? cy + a[6] : a[6];
      pts.push([cx, cy]);
    } else {
      // Point pairs (M/L/T and the control points of C/S/Q): each is relative to
      // the current point, which only advances to the command's final point.
      let ex = cx;
      let ey = cy;
      for (let k = 0; k < n; k += 2) {
        const px = rel ? cx + a[k] : a[k];
        const py = rel ? cy + a[k + 1] : a[k + 1];
        pts.push([px, py]);
        ex = px;
        ey = py;
      }
      cx = ex;
      cy = ey;
      if (up === "M") {
        sx = cx;
        sy = cy;
      }
    }
  }
  return pts;
}

/** Collect every geometry point of `el` and its children, in atlas coordinates. */
function collectPoints(el, parent, pts) {
  const m = mul(parent, toMatrix(el.getAttribute?.("transform")));
  const num = (name, dflt = 0) => {
    const v = parseFloat(el.getAttribute?.(name) ?? "");
    return Number.isNaN(v) ? dflt : v;
  };
  switch (el.tagName?.toLowerCase()) {
    case "path":
      for (const [x, y] of pathPoints(el.getAttribute("d") ?? ""))
        pts.push(applyM(m, x, y));
      break;
    case "circle":
    case "ellipse": {
      const rx = el.hasAttribute("r") ? num("r") : num("rx");
      const ry = el.hasAttribute("r") ? num("r") : num("ry");
      pts.push(applyM(m, num("cx") - rx, num("cy") - ry));
      pts.push(applyM(m, num("cx") + rx, num("cy") + ry));
      break;
    }
    case "rect":
      pts.push(applyM(m, num("x"), num("y")));
      pts.push(applyM(m, num("x") + num("width"), num("y") + num("height")));
      break;
    case "line":
      pts.push(applyM(m, num("x1"), num("y1")));
      pts.push(applyM(m, num("x2"), num("y2")));
      break;
    case "polyline":
    case "polygon": {
      const nums = (el.getAttribute("points") ?? "")
        .split(/[\s,]+/)
        .map(Number)
        .filter((v) => !Number.isNaN(v));
      for (let k = 0; k + 1 < nums.length; k += 2)
        pts.push(applyM(m, nums[k], nums[k + 1]));
      break;
    }
    case "text":
      pts.push(applyM(m, num("x"), num("y")));
      break;
    default:
      break;
  }
  for (const child of el.children ?? []) collectPoints(child, m, pts);
}

/** The grid cell an element's art is centred in: `{ x0, y0 }` (top-left corner). */
function cellOrigin(el, cell) {
  const pts = [];
  collectPoints(el, [1, 0, 0, 1, 0, 0], pts);
  if (!pts.length) return null; // no geometry — an empty group, not yet drawn
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
  return {
    x0: Math.floor(midX / cell) * cell,
    y0: Math.floor(midY / cell) * cell,
  };
}

// --- Atlas parsing -----------------------------------------------------------

/** The atlas whose art every Device falls back to when it draws none of its own. */
const SHARED = "shared";

/**
 * The emitted key for a cell: the bare `id` for shared art, `<atlas>:<id>` for a
 * Device's own drawing. Ids are bare, so the atlas a cell lives in is the only
 * thing that scopes it — `resolveSymbolSvg` prefers the Device-scoped key and
 * falls back to the shared one.
 */
function keyFor(atlasId, id) {
  return atlasId === SHARED ? id : `${atlasId}:${id}`;
}

/**
 * The cells one atlas is expected to draw, keyed by the id used **in that file**
 * — an asset's bare `id` unless its `cells` map renames it there (PlayStation
 * draws `bumper` as `R1`). Lets each atlas use its own vocabulary without the
 * asset id having to change.
 */
function cellIndex(atlasId) {
  const map = new Map();
  for (const asset of SYMBOL_MANIFEST) {
    if (!asset.atlases?.includes(atlasId)) continue;
    map.set(asset.cells?.[atlasId] ?? asset.id, asset);
  }
  return map;
}

/**
 * Extract every source `<g id>` cell from one atlas into `{ markup, x0, y0, cell }`,
 * where `markup` is the cell's art verbatim (authored absolute coordinates) and
 * `x0/y0` is the top-left of the grid cell it's centred in. The standalone SVG's
 * viewBox is windowed to that cell, so derived twins can rotate about the cell
 * centre. Derived ids must not be authored.
 *
 * An id the manifest doesn't list for this atlas is an error: the pair of lists
 * has to agree, or art silently goes missing (or lands under the wrong Device).
 */
function parseAtlas(atlasId, svgText, file) {
  const dom = new JSDOM(svgText, { contentType: "image/svg+xml" });
  const { document, XMLSerializer } = dom.window;
  const root = document.querySelector("svg");
  if (!root) throw new Error(`${file}: no root <svg> element.`);
  const cell = parseFloat(root.getAttribute("data-cell") ?? "") || DEFAULT_CELL;
  const serializer = new XMLSerializer();

  const cells = cellIndex(atlasId);
  const sources = {};
  for (const el of root.querySelectorAll("[id]")) {
    const id = el.getAttribute("id");
    const asset = cells.get(id);
    if (!asset) {
      // Not a cell this atlas draws. Usually a layer group or defs — but if the
      // manifest knows the id, the two lists have drifted and art would silently
      // vanish, so say so instead.
      const known = manifestById.get(id);
      if (!known) continue;
      if (isDerived(known))
        throw new Error(
          `${file}: "${id}" is derived (rotateOf "${known.rotateOf}") — don't author a cell for it.`,
        );
      throw new Error(
        `${file}: "${id}" is drawn here, but the manifest lists it in ` +
          `${JSON.stringify(known.atlases ?? [])} — add "${atlasId}" to its \`atlases\`.`,
      );
    }
    const key = keyFor(atlasId, asset.id);
    if (sources[key]) throw new Error(`${file}: duplicate id "${id}".`);

    const origin = cellOrigin(el, cell);
    if (!origin) continue; // empty group — treated as not-yet-authored (pending)
    collectNonSentinel(el, asset.id);
    sources[key] = {
      markup: serializer.serializeToString(el),
      cell,
      ...origin,
    };
  }
  return sources;
}

/** Wrap authored cell art in a standalone SVG windowed to its grid cell. */
function standalone(markup, x0, y0, cell) {
  return `${SVG_OPEN} viewBox="${x0} ${y0} ${cell} ${cell}">${markup}</svg>`;
}

// --- Run -------------------------------------------------------------------

const atlases = readdirSync(HERE).filter((f) => f.endsWith("-symbols.svg"));
const sources = {};
for (const file of atlases) {
  const atlasId = basename(file, "-symbols.svg");
  const parsed = parseAtlas(
    atlasId,
    readFileSync(join(HERE, file), "utf8"),
    file,
  );
  Object.assign(sources, parsed);
  console.log(`  ${atlasId}: ${Object.keys(parsed).length} source cell(s)`);
}

/** The atlases an asset is drawn in — a derived asset inherits its source's. */
function atlasesOf(asset) {
  return (
    (isDerived(asset)
      ? manifestById.get(asset.rotateOf)?.atlases
      : asset.atlases) ?? []
  );
}

// Emit in manifest order, once per atlas the asset is drawn in: sources verbatim,
// derived twins as a rotation of their source about its cell centre. Each Device's
// rotations therefore come from that Device's own art. Anything not drawn yet is
// skipped and reported below.
const svgs = {};
for (const a of SYMBOL_MANIFEST) {
  for (const atlas of atlasesOf(a)) {
    const src = sources[keyFor(atlas, isDerived(a) ? a.rotateOf : a.id)];
    if (!src) continue; // not drawn in this atlas yet
    const markup = isDerived(a)
      ? `<g transform="rotate(${a.rotate} ${src.x0 + src.cell / 2} ${
          src.y0 + src.cell / 2
        })">${src.markup}</g>`
      : src.markup;
    svgs[keyFor(atlas, a.id)] = standalone(markup, src.x0, src.y0, src.cell);
  }
}

// A manifest id with no art yet is a warning, not an error, so the slice can land
// device-by-device (mirrors the layouts "empty until authored").
const pending = SYMBOL_MANIFEST.flatMap((a) =>
  atlasesOf(a)
    .filter((atlas) => !svgs[keyFor(atlas, a.id)])
    .map((atlas) => keyFor(atlas, a.id)),
);
if (pending.length)
  console.warn(`  pending (not authored yet): ${pending.join(", ")}`);

// Non-sentinel paints keep their authored colour but can't be role-colorized —
// flag them so an off-primary export never slips through unnoticed (ADR-0007).
if (nonSentinel.length) {
  console.warn(
    `  ⚠ ${nonSentinel.length} non-sentinel paint(s) — kept as authored, not role-configurable:`,
  );
  for (const w of nonSentinel)
    console.warn(`      ${w.assetId} <${w.shapeId}> ${w.prop}: ${w.value}`);
}

const banner =
  "// GENERATED FILE — do not edit by hand.\n" +
  "// Regenerate with `npm run symbols` after changing an atlas SVG in this folder\n" +
  "// or `manifest.mjs`. See `README.md`.\n\n" +
  'import type { SymbolAsset } from "@/lib/glyph/symbols";\n\n' +
  "/** Every shipped Symbol + Authored Background, in manifest order. */\n";

const assets = `export const SYMBOL_ASSETS: SymbolAsset[] = ${JSON.stringify(
  SYMBOL_MANIFEST,
  null,
  2,
)};\n\n`;

const svgDoc =
  "/**\n" +
  " * Standalone square-viewBox SVG per asset id, windowed from the authored\n" +
  " * atlases (derived directions rotated in). Missing keys are assets not yet\n" +
  " * drawn; callers fall back to the Input's label.\n" +
  " */\n";
const svgBody = `export const SYMBOL_SVGS: Record<string, string> = ${JSON.stringify(
  svgs,
  null,
  2,
)};\n`;

writeFileSync(OUT, banner + assets + svgDoc + svgBody);
console.log(
  `Wrote ${OUT} (${SYMBOL_MANIFEST.length} assets, ${Object.keys(svgs).length} authored).`,
);

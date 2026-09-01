/**
 * The browser half of Symbol Set import (#39): parsing an authored atlas SVG and
 * **measuring** it into the shape `set-import.ts` reconciles.
 *
 * This is the one step that cannot be pure. A cell's bounds depend on layout —
 * what a `<text>` actually occupies once a font is applied, where a stroke's
 * width pushes an edge — and only a real engine knows. `build-symbols.mjs` gets
 * there with jsdom plus hand-rolled bounding-box maths because jsdom has no
 * layout; in a browser it is `getBBox()`, which the prototype confirmed
 * reproduces every shipped `xbox-symbols.svg` viewBox exactly.
 *
 * Two things bite, both found by measuring rather than by reasoning:
 *
 * - **The measuring element must be full size.** `getBBox()` on a `<text>` in an
 *   SVG left to size itself to its container is wrong by roughly 8×, so the
 *   mounted copy is pinned to its own `viewBox` dimensions and measured in its
 *   own coordinate system, where nothing about the page's layout can reach it.
 * - **A cell's own transform is not in its own `getBBox()`.** `getBBox()` reports
 *   an element's bounds in *its own* user space, before its `transform` applies.
 *   The shipped atlases place every cell with `transform="translate(col, row)"`
 *   (see `README.md`), so measuring naively puts every one of them in the
 *   top-left grid square. Bounds are therefore mapped up into the root's space
 *   through the element's CTM, which handles nesting and rotation for free.
 */
import type {
  MeasuredAtlas,
  MeasuredCandidate,
  MeasuredPaint,
} from "@/lib/glyph/symbols/set-import";

/** The shapes whose paints are worth reading; a `<g>` carries no ink of its own. */
const SHAPE_SELECTOR = "path,circle,ellipse,rect,line,polygon,polyline,text";

/** The authoring grid the shipped atlases use, when a file names no other. */
const DEFAULT_CELL_SIZE = 256;

/** Thrown for a file that is not an atlas, with text the review can show. */
export class AtlasParseError extends Error {}

/**
 * Read a paint off a shape, preferring the `style` declaration over the
 * presentation attribute — the order the cascade resolves them in, and the one a
 * design tool's export usually relies on.
 */
function readProp(el: Element, name: string): string {
  const style = el.getAttribute("style") ?? "";
  const declared = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(style);
  return (declared ? declared[1] : (el.getAttribute(name) ?? "")).trim();
}

/**
 * Whether a paint renders nothing because it was turned off by opacity.
 *
 * Worth checking separately from the colour: a guide box drawn in a real colour
 * at `fill-opacity:0` is invisible, and flagging it as a non-sentinel paint
 * would train the importer to ignore the flags that matter.
 */
function paintHidden(el: Element, prop: string): boolean {
  return (
    readProp(el, `${prop}-opacity`) === "0" || readProp(el, "opacity") === "0"
  );
}

/** Every paint an element and its descendants draw with, excluding the hidden. */
function paintsOf(el: Element): MeasuredPaint[] {
  const shapes = [el, ...el.querySelectorAll(SHAPE_SELECTOR)].filter((node) =>
    node.matches(SHAPE_SELECTOR),
  );
  const paints: MeasuredPaint[] = [];
  for (const shape of shapes) {
    for (const prop of ["fill", "stroke"] as const) {
      if (paintHidden(shape, prop)) continue;
      const value = readProp(shape, prop);
      if (!value) continue;
      paints.push({
        shape: shape.getAttribute("id") ?? shape.tagName,
        prop,
        value,
      });
    }
  }
  return paints;
}

/**
 * An element's bounds in the **root's** coordinate system.
 *
 * `getBBox()` alone is the element's own space, which drops the `transform` that
 * places a cell on the grid. Mapping the box's four corners through the
 * element-to-root matrix restores it, and does so for any transform — a rotated
 * cell gives the axis-aligned box of its rotated art, which is what a window has
 * to be cut to.
 *
 * Falls back to the untransformed box where no matrix is available, which is
 * what an un-mounted or `display:none` subtree gives; that measures as
 * zero-sized and is skipped downstream as "nothing drawn yet" either way.
 */
function boundsInRoot(el: SVGGraphicsElement, root: SVGGraphicsElement) {
  const box = el.getBBox();
  const rootCtm = root.getScreenCTM();
  const elCtm = el.getScreenCTM();
  if (!rootCtm || !elCtm) return box;

  const toRoot = rootCtm.inverse().multiply(elCtm);
  const corners = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ].map(([x, y]) => ({
    x: toRoot.a * x + toRoot.c * y + toRoot.e,
    y: toRoot.b * x + toRoot.d * y + toRoot.f,
  }));

  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * The elements a drawing can be made of — what a candidate has to be one of.
 *
 * A positive list rather than a list of what to reject: `<clipPath>`, `<defs>`
 * and the gradients are named in every design-tool export and drawn by none of
 * them, and asking whether an element *renders* is a question only a browser can
 * answer — while asking whether it is a shape is the same answer everywhere.
 */
const DRAWABLE_SELECTOR =
  "g,path,circle,ellipse,rect,line,polygon,polyline,text,image,use,svg,foreignObject";

/**
 * Which id'd elements are **candidates**: the outermost naming of each drawing.
 *
 * Outermost rather than the root's own children, because that is not where a
 * design tool puts the art. Every shipped atlas is exported with its whole page
 * inside one unnamed `<g clip-path>`, so the root's id'd children are the frame
 * rect and a `<clipPath>` and nothing else — the cells sit one level down, and
 * asking for `:scope > [id]` finds none of them.
 *
 * Outermost rather than *every* `[id]`, because a cell's own parts are often
 * named too — `dpad-right` holds a `DPad_Right` — and each would otherwise
 * import as a rival cell claiming the same grid square.
 *
 * A non-{@link DRAWABLE_SELECTOR} element is not a candidate at all rather than
 * a skip with a reason: a review lists what might have been art, and a
 * `<clipPath>` could not have been.
 */
export function candidateElements(root: Element): SVGGraphicsElement[] {
  return [...root.querySelectorAll("[id]")].filter(
    (el): el is SVGGraphicsElement => {
      const owner = el.parentElement?.closest("[id]");
      return (!owner || owner === root) && el.matches(DRAWABLE_SELECTOR);
    },
  );
}

/**
 * Parse and measure an atlas SVG into the shape {@link windowAtlas} expects.
 *
 * Which elements are candidates is {@link candidateElements}; deciding which of
 * those are art is `windowCell`'s job, because that decision has to be
 * explainable and this function only reports what the engine saw.
 *
 * Requires a DOM. The `host` is mounted, measured, and emptied again — pass an
 * off-screen element the caller owns, since measuring needs the subtree to be in
 * a rendered document and borrowing `document.body` would flash the atlas.
 *
 * @throws {AtlasParseError} if the file isn't a well-formed SVG.
 */
export function measureAtlas(svgText: string, host: Element): MeasuredAtlas {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const parsed = doc.querySelector("svg");
  if (!parsed || doc.querySelector("parsererror"))
    throw new AtlasParseError("That file doesn’t parse as an SVG.");

  host.replaceChildren(document.importNode(parsed, true));
  const root = host.firstElementChild as SVGGraphicsElement | null;
  if (!root) throw new AtlasParseError("That file doesn’t parse as an SVG.");

  try {
    // Pin the mounted copy to its own coordinate system, so nothing about the
    // page's layout can bend a measurement.
    const viewBox = (root.getAttribute("viewBox") ?? "")
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    if (viewBox.length === 4) {
      root.setAttribute("width", String(viewBox[2]));
      root.setAttribute("height", String(viewBox[3]));
    }

    const cellSize =
      Number.parseFloat(root.getAttribute("data-cell") ?? "") ||
      DEFAULT_CELL_SIZE;

    const candidates: MeasuredCandidate[] = [];
    for (const el of candidateElements(root)) {
      candidates.push({
        id: el.getAttribute("id")!,
        markup: new XMLSerializer().serializeToString(el),
        bbox: boundsInRoot(el, root),
        paints: paintsOf(el),
      });
    }
    return { cellSize, candidates };
  } finally {
    host.replaceChildren();
  }
}

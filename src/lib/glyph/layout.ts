/**
 * Device Layout geometry (ADR-0005): the **code-drawn schematic** each Device's
 * Catalog is rendered through for selection. It is editor chrome only — a picker
 * for enabling Inputs — and never part of an exported Sprite Atlas.
 *
 * The geometry is code-maintained *data*, not authored art: the keyboard is a
 * US-staggered rounded-rect keycap board built from row metadata, and the pads
 * are clustered nodes over a prototype controller outline. Positions here are
 * in abstract units; the {@link DeviceLayout} component scales them to fit.
 *
 * The keyboard Device draws through **two** Layouts: {@link KEYBOARD_LAYOUT}
 * for the keycap board and {@link MOUSE_LAYOUT} for the mouse it places beside
 * it. The mouse buttons are keyboard Catalog Inputs, but three 1u caps in a row
 * read as three keys, so they get a schematic of their own.
 *
 * Every id below must be a real Catalog id (see `catalog.ts`); `layout.test.ts`
 * pins the two into a bijection — spanning both keyboard Layouts — so a Catalog
 * never grows an Input with no place on its Layout, and the Layout never
 * references an Input the Catalog dropped.
 */

import { AUTHORED_PAD_LAYOUTS } from "@/lib/glyph/layouts/pad-layouts.generated";

// --- Keyboard --------------------------------------------------------------

/** One keycap on the keyboard Layout, in key-units (1u = one standard key). */
export interface KeycapKey {
  /** Catalog id this cap toggles, e.g. "key-space". */
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A row entry: a keycap of `w` units (default 1), or a horizontal `gap`. */
type RowItem = { name: string; w?: number } | { gap: number };

/** Keycap for a keyboard Catalog id (`key-<name>`), `w` units wide (default 1). */
function k(name: string, w = 1): RowItem {
  return { name, w };
}

/** A horizontal gap of `n` units between keycaps. */
function gap(n: number): RowItem {
  return { gap: n };
}

/**
 * Lay rows of {@link RowItem}s out left-to-right, top-to-bottom, from an origin.
 * Each row advances y by one unit; gaps only advance x. Ids are prefixed
 * `key-` so callers write the short key name.
 */
function layoutRows(rows: RowItem[][], originX = 0, originY = 0): KeycapKey[] {
  const keys: KeycapKey[] = [];
  rows.forEach((row, r) => {
    let x = originX;
    const y = originY + r;
    for (const item of row) {
      if ("gap" in item) {
        x += item.gap;
        continue;
      }
      const w = item.w ?? 1;
      keys.push({ id: `key-${item.name}`, x, y, w, h: 1 });
      x += w;
    }
  });
  return keys;
}

// The main board: function row, then the number/QWERTY/home/shift/modifier rows,
// with a 0.5u breather below the function row like a real keyboard.
const FUNCTION_ROW: RowItem[][] = [
  [
    k("esc"),
    gap(0.5),
    k("f1"),
    k("f2"),
    k("f3"),
    k("f4"),
    gap(0.5),
    k("f5"),
    k("f6"),
    k("f7"),
    k("f8"),
    gap(0.5),
    k("f9"),
    k("f10"),
    k("f11"),
    k("f12"),
  ],
];

const MAIN_ROWS: RowItem[][] = [
  [
    k("backtick"),
    k("1"),
    k("2"),
    k("3"),
    k("4"),
    k("5"),
    k("6"),
    k("7"),
    k("8"),
    k("9"),
    k("0"),
    k("minus"),
    k("equals"),
    k("backspace", 2),
  ],
  [
    k("tab", 1.5),
    k("q"),
    k("w"),
    k("e"),
    k("r"),
    k("t"),
    k("y"),
    k("u"),
    k("i"),
    k("o"),
    k("p"),
    k("bracket-left"),
    k("bracket-right"),
    k("backslash", 1.5),
  ],
  [
    k("caps-lock", 1.75),
    k("a"),
    k("s"),
    k("d"),
    k("f"),
    k("g"),
    k("h"),
    k("j"),
    k("k"),
    k("l"),
    k("semicolon"),
    k("quote"),
    k("enter", 2.25),
  ],
  [
    k("shift", 2.25),
    k("z"),
    k("x"),
    k("c"),
    k("v"),
    k("b"),
    k("n"),
    k("m"),
    k("comma"),
    k("period"),
    k("slash"),
  ],
  [
    k("ctrl", 1.25),
    k("windows", 1.25),
    k("command", 1.25),
    k("alt", 1.25),
    k("space", 5),
    k("menu", 1.25),
  ],
];

// The nav cluster (2 columns) sits to the right of the main board, aligned with
// the number/QWERTY/home rows; the arrow keys form an inverted-T below it.
const NAV_X = 15.75;
const NAV_CLUSTER: KeycapKey[] = layoutRows(
  [
    [k("insert"), k("delete")],
    [k("home"), k("end")],
    [k("page-up"), k("page-down")],
  ],
  NAV_X,
  1, // aligns with the number row (main board's first row)
);

const ARROWS: KeycapKey[] = [
  { id: "key-arrow-up", x: NAV_X + 1, y: 4, w: 1, h: 1 },
  { id: "key-arrow-left", x: NAV_X, y: 5, w: 1, h: 1 },
  { id: "key-arrow-down", x: NAV_X + 1, y: 5, w: 1, h: 1 },
  { id: "key-arrow-right", x: NAV_X + 2, y: 5, w: 1, h: 1 },
];

/** The full keyboard Layout: every key placed once, US-staggered. */
export const KEYBOARD_LAYOUT: KeycapKey[] = [
  ...layoutRows(FUNCTION_ROW, 0, 0),
  ...layoutRows(MAIN_ROWS, 0, 1.25),
  ...NAV_CLUSTER,
  ...ARROWS,
];

/**
 * Where the mouse sits on the keyboard Layout, in the same key-units as the
 * keycaps: its own panel to the right of the arrow cluster, bottom-aligned with
 * the board. The mouse's Inputs are drawn from {@link MOUSE_LAYOUT}, which has
 * its own coordinate space; this is only the box that space is scaled into.
 */
export const MOUSE_PLACEMENT = { x: 19.25, y: 1.75, w: 3, h: 4.5 } as const;

/**
 * The bounding box (in key-units) that contains the whole keyboard Layout —
 * every keycap **and** the mouse panel — from the origin.
 */
export function keyboardExtent(): { width: number; height: number } {
  let width = MOUSE_PLACEMENT.x + MOUSE_PLACEMENT.w;
  let height = MOUSE_PLACEMENT.y + MOUSE_PLACEMENT.h;
  for (const key of KEYBOARD_LAYOUT) {
    width = Math.max(width, key.x + key.w);
    height = Math.max(height, key.y + key.h);
  }
  return { width, height };
}

// --- Pads ------------------------------------------------------------------

/**
 * One clickable shape on a pad Layout, bound to a Catalog id. `tag` + `geom`
 * reconstruct the SVG element ({@link DeviceLayout} strips authored fill/stroke
 * and applies the enabled/disabled theme). `contentAt` is an optional centre for
 * the node's in-shape content — its Symbol, or a short label placeholder. Round
 * and rectangular shapes report their exact centre; paths and polygons are
 * measured from their on-path points (`path-bbox.mjs`), which is approximate for
 * curves. Only a transformed shape, which we don't resolve, reports none.
 */
export interface PadButtonShape {
  /** Catalog id this shape toggles, e.g. "xbox-a". */
  id: string;
  /** SVG element name, e.g. "circle", "rect", "path", "polygon". */
  tag: string;
  /** Geometry attributes only (e.g. `d`, `cx`/`cy`/`r`, `points`, `x`/`y`/…). */
  geom: Record<string, string | number>;
  contentAt?: { x: number; y: number; r: number };
}

/**
 * A pad's Layout: a viewBox, a `decoration` blob (the controller outline plus any
 * non-interactive backer shapes, drawn behind and painted verbatim), and the
 * clickable `buttons`. Authored SVGs (see `layouts/`) and the code-drawn fallback
 * below both produce this one shape so the renderer only knows one thing.
 */
export interface PadLayout {
  viewBox: { width: number; height: number };
  /** Raw SVG markup for the outline + backers, drawn behind the buttons. */
  decoration: string;
  buttons: PadButtonShape[];
}

// Both code-drawn pads share one geometry template (a standard twin-stick
// controller); only the Catalog ids/labels differ. Slots are filled per pad below.
const PAD_VIEWBOX = { width: 300, height: 210 };

/** Radii for the different node kinds — sticks read largest, centers smallest. */
const R = { button: 13, stick: 18, center: 9 } as const;

interface PadSlots {
  triggerL: string;
  triggerR: string;
  bumperL: string;
  bumperR: string;
  stickL: string;
  stickR: string;
  dpadUp: string;
  dpadDown: string;
  dpadLeft: string;
  dpadRight: string;
  faceTop: string;
  faceBottom: string;
  faceLeft: string;
  faceRight: string;
  centerL: string;
  centerR: string;
}

/** A code-drawn circular button: a circle shape with a centred label slot. */
function circleButton(
  id: string,
  x: number,
  y: number,
  r: number,
): PadButtonShape {
  return {
    id,
    tag: "circle",
    geom: { cx: x, cy: y, r },
    contentAt: { x, y, r },
  };
}

/** Place a pad's Inputs into the shared code-drawn controller template. */
function padLayout(slots: PadSlots): PadLayout {
  const buttons: PadButtonShape[] = [
    circleButton(slots.triggerL, 60, 20, R.button),
    circleButton(slots.triggerR, 240, 20, R.button),
    circleButton(slots.bumperL, 60, 48, R.button),
    circleButton(slots.bumperR, 240, 48, R.button),
    circleButton(slots.stickL, 72, 90, R.stick),
    circleButton(slots.stickR, 200, 150, R.stick),
    // D-pad cross, centred at (110, 135).
    circleButton(slots.dpadUp, 110, 113, R.button),
    circleButton(slots.dpadDown, 110, 157, R.button),
    circleButton(slots.dpadLeft, 88, 135, R.button),
    circleButton(slots.dpadRight, 132, 135, R.button),
    // Face-button diamond, centred at (228, 95).
    circleButton(slots.faceTop, 228, 73, R.button),
    circleButton(slots.faceBottom, 228, 117, R.button),
    circleButton(slots.faceLeft, 206, 95, R.button),
    circleButton(slots.faceRight, 250, 95, R.button),
    circleButton(slots.centerL, 135, 82, R.center),
    circleButton(slots.centerR, 165, 82, R.center),
  ];
  return { viewBox: PAD_VIEWBOX, decoration: PAD_DECORATION, buttons };
}

/** Schematic twin-stick controller outline, sized to {@link PAD_VIEWBOX}. */
const PAD_OUTLINE =
  "M70,52 C40,47 22,72 20,112 C16,182 60,197 95,177 C110,168 120,152 132,152 " +
  "L168,152 C180,152 190,168 205,177 C240,197 284,182 280,112 C278,72 260,47 " +
  "230,52 C170,62 130,62 70,52 Z";

/** The code-drawn fallback's decoration: just the prototype outline path. */
const PAD_DECORATION = `<path data-outline d="${PAD_OUTLINE}" class="fill-muted/30 stroke-border" stroke-width="2" />`;

/**
 * The key `layouts/mouse.svg` generates under. It shares the authored-layout
 * pipeline with the pads but is not a pad, so it is filtered out of
 * {@link PAD_LAYOUTS} and exposed as {@link MOUSE_LAYOUT} instead.
 */
const MOUSE_LAYOUT_ID = "mouse";

/** The code-drawn fallback Layouts, used until an authored SVG lands per pad. */
const CODE_DRAWN_PAD_LAYOUTS: Record<string, PadLayout> = {
  xbox: padLayout({
    triggerL: "xbox-lt",
    triggerR: "xbox-rt",
    bumperL: "xbox-lb",
    bumperR: "xbox-rb",
    stickL: "xbox-left-stick",
    stickR: "xbox-right-stick",
    dpadUp: "xbox-dpad-up",
    dpadDown: "xbox-dpad-down",
    dpadLeft: "xbox-dpad-left",
    dpadRight: "xbox-dpad-right",
    faceTop: "xbox-y",
    faceBottom: "xbox-a",
    faceLeft: "xbox-x",
    faceRight: "xbox-b",
    centerL: "xbox-view",
    centerR: "xbox-menu",
  }),
  playstation: padLayout({
    triggerL: "ps-l2",
    triggerR: "ps-r2",
    bumperL: "ps-l1",
    bumperR: "ps-r1",
    stickL: "ps-left-stick",
    stickR: "ps-right-stick",
    dpadUp: "ps-dpad-up",
    dpadDown: "ps-dpad-down",
    dpadLeft: "ps-dpad-left",
    dpadRight: "ps-dpad-right",
    faceTop: "ps-triangle",
    faceBottom: "ps-cross",
    faceLeft: "ps-square",
    faceRight: "ps-circle",
    centerL: "ps-share",
    centerR: "ps-options",
  }),
};

/**
 * Pad Layouts keyed by Catalog id: an **authored** SVG Layout when one has been
 * exported for that pad (see `layouts/`), otherwise the code-drawn fallback.
 * Keyboards use {@link KEYBOARD_LAYOUT}, not this.
 *
 * `mouse` is deliberately not here even though it is authored alongside the
 * pads: {@link getPadLayout} is called with a *Catalog* id, and the mouse is a
 * cluster of Inputs on the keyboard Catalog rather than a Device of its own.
 */
export const PAD_LAYOUTS: Record<string, PadLayout> = {
  ...CODE_DRAWN_PAD_LAYOUTS,
  ...Object.fromEntries(
    Object.entries(AUTHORED_PAD_LAYOUTS).filter(
      ([id]) => id !== MOUSE_LAYOUT_ID,
    ),
  ),
};

/** The pad Layout for a Catalog id, or `undefined` (e.g. for the keyboard). */
export function getPadLayout(catalogId: string): PadLayout | undefined {
  return PAD_LAYOUTS[catalogId];
}

// --- Mouse -----------------------------------------------------------------

/**
 * **Provisional** mouse schematic, to be replaced by the authored
 * `layouts/mouse.svg` (issue #35 Part 1). Deliberately plain — a symmetric
 * silhouette with slab buttons — so it can't be mistaken for the real art. Its
 * job is to prove the wiring: six nodes, correctly bound and clickable.
 *
 * The body node and the button nodes overlap by construction and the topmost
 * wins, which is why `mouse` is listed first.
 */
const PLACEHOLDER_MOUSE_LAYOUT: PadLayout = {
  viewBox: { width: 200, height: 300 },
  // A dashed frame, so a provisional mouse reads as provisional on screen.
  decoration:
    '<rect data-placeholder x="4" y="4" width="192" height="292" rx="12" ' +
    'fill="none" class="stroke-border" stroke-width="2" stroke-dasharray="8 8" />',
  buttons: [
    {
      id: "mouse",
      tag: "path",
      geom: {
        d:
          "M100,14 C58,14 26,52 26,128 L26,232 C26,272 59,288 100,288 " +
          "C141,288 174,272 174,232 L174,128 C174,52 142,14 100,14 Z",
      },
      contentAt: { x: 100, y: 151, r: 74 },
    },
    {
      id: "mouse-left",
      tag: "path",
      geom: { d: "M86,14 C56,18 26,58 26,128 L86,128 Z" },
      contentAt: { x: 56, y: 71, r: 30 },
    },
    {
      id: "mouse-right",
      tag: "path",
      geom: { d: "M114,14 C144,18 174,58 174,128 L114,128 Z" },
      contentAt: { x: 144, y: 71, r: 30 },
    },
    {
      id: "mouse-middle",
      tag: "rect",
      geom: { x: 86, y: 30, width: 28, height: 70, rx: 14 },
      contentAt: { x: 100, y: 65, r: 14 },
    },
    // Side buttons, forward (5) above back (4) as they sit under the thumb.
    {
      id: "mouse-5",
      tag: "rect",
      geom: { x: 22, y: 142, width: 26, height: 30, rx: 8 },
      contentAt: { x: 35, y: 157, r: 13 },
    },
    {
      id: "mouse-4",
      tag: "rect",
      geom: { x: 22, y: 176, width: 26, height: 30, rx: 8 },
      contentAt: { x: 35, y: 191, r: 13 },
    },
  ],
};

/**
 * The mouse's Layout — a {@link PadLayout} like the controllers, because it
 * needs exactly what they need: a decoration blob, shaped buttons, and a centre
 * for each node's content. It is *not* a pad, so it is exposed here rather than
 * through {@link PAD_LAYOUTS}; {@link KEYBOARD_LAYOUT} places it via
 * {@link MOUSE_PLACEMENT}, and together the two cover the keyboard Catalog
 * exactly once (see `layout.test.ts`).
 *
 * Authored art wins as soon as `layouts/mouse.svg` lands — `build-layouts.mjs`
 * keys on the bare filename, so it generates into `AUTHORED_PAD_LAYOUTS.mouse`
 * with no codegen change.
 */
export const MOUSE_LAYOUT: PadLayout =
  AUTHORED_PAD_LAYOUTS[MOUSE_LAYOUT_ID] ?? PLACEHOLDER_MOUSE_LAYOUT;

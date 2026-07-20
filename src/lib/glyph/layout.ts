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
 * Every id below must be a real Catalog id (see `catalog.ts`); `layout.test.ts`
 * pins the two into a bijection so a Catalog never grows an Input with no place
 * on its Layout, and the Layout never references an Input the Catalog dropped.
 */

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
    k("f1"), k("f2"), k("f3"), k("f4"),
    gap(0.5),
    k("f5"), k("f6"), k("f7"), k("f8"),
    gap(0.5),
    k("f9"), k("f10"), k("f11"), k("f12"),
  ],
];

const MAIN_ROWS: RowItem[][] = [
  [
    k("backtick"),
    k("1"), k("2"), k("3"), k("4"), k("5"),
    k("6"), k("7"), k("8"), k("9"), k("0"),
    k("minus"), k("equals"), k("backspace", 2),
  ],
  [
    k("tab", 1.5),
    k("q"), k("w"), k("e"), k("r"), k("t"),
    k("y"), k("u"), k("i"), k("o"), k("p"),
    k("bracket-left"), k("bracket-right"), k("backslash", 1.5),
  ],
  [
    k("caps-lock", 1.75),
    k("a"), k("s"), k("d"), k("f"), k("g"),
    k("h"), k("j"), k("k"), k("l"),
    k("semicolon"), k("quote"), k("enter", 2.25),
  ],
  [
    k("shift", 2.25),
    k("z"), k("x"), k("c"), k("v"), k("b"),
    k("n"), k("m"), k("comma"), k("period"), k("slash"),
  ],
  [
    k("ctrl", 1.25), k("super", 1.25), k("alt", 1.25),
    k("space", 6.25),
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

// The three mouse buttons live on the Keyboard Catalog as common PC Inputs, so
// they get a small labelled cluster of their own below the main board.
const MOUSE: KeycapKey[] = layoutRows(
  [[{ name: "left" }, { name: "right" }, { name: "middle" }]],
  0,
  6.5,
).map((cap) => ({ ...cap, id: cap.id.replace(/^key-/, "mouse-") }));

/** The full keyboard Layout: every key placed once, US-staggered. */
export const KEYBOARD_LAYOUT: KeycapKey[] = [
  ...layoutRows(FUNCTION_ROW, 0, 0),
  ...layoutRows(MAIN_ROWS, 0, 1.25),
  ...NAV_CLUSTER,
  ...ARROWS,
  ...MOUSE,
];

/** The bounding box (in key-units) that contains every keycap, from the origin. */
export function keyboardExtent(): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const key of KEYBOARD_LAYOUT) {
    width = Math.max(width, key.x + key.w);
    height = Math.max(height, key.y + key.h);
  }
  return { width, height };
}

// --- Pads ------------------------------------------------------------------

/** One clustered node on a pad Layout, at (`x`,`y`) with radius `r`, in viewBox units. */
export interface PadNode {
  /** Catalog id this node toggles, e.g. "xbox-a". */
  id: string;
  x: number;
  y: number;
  r: number;
}

/** A pad's code-drawn Layout: its viewBox, a prototype outline, and its nodes. */
export interface PadLayout {
  viewBox: { width: number; height: number };
  /** SVG path for the prototype controller outline, drawn behind the nodes. */
  outline: string;
  nodes: PadNode[];
}

// Both pads share one geometry template (a standard twin-stick controller); only
// the Catalog ids/labels differ. Slots are filled per pad below.
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

/** Place a pad's Inputs into the shared controller template. */
function padLayout(slots: PadSlots): PadLayout {
  const nodes: PadNode[] = [
    { id: slots.triggerL, x: 60, y: 20, r: R.button },
    { id: slots.triggerR, x: 240, y: 20, r: R.button },
    { id: slots.bumperL, x: 60, y: 48, r: R.button },
    { id: slots.bumperR, x: 240, y: 48, r: R.button },
    { id: slots.stickL, x: 72, y: 90, r: R.stick },
    { id: slots.stickR, x: 200, y: 150, r: R.stick },
    // D-pad cross, centred at (110, 135).
    { id: slots.dpadUp, x: 110, y: 113, r: R.button },
    { id: slots.dpadDown, x: 110, y: 157, r: R.button },
    { id: slots.dpadLeft, x: 88, y: 135, r: R.button },
    { id: slots.dpadRight, x: 132, y: 135, r: R.button },
    // Face-button diamond, centred at (228, 95).
    { id: slots.faceTop, x: 228, y: 73, r: R.button },
    { id: slots.faceBottom, x: 228, y: 117, r: R.button },
    { id: slots.faceLeft, x: 206, y: 95, r: R.button },
    { id: slots.faceRight, x: 250, y: 95, r: R.button },
    { id: slots.centerL, x: 135, y: 82, r: R.center },
    { id: slots.centerR, x: 165, y: 82, r: R.center },
  ];
  return { viewBox: PAD_VIEWBOX, outline: PAD_OUTLINE, nodes };
}

/** Schematic twin-stick controller outline, sized to {@link PAD_VIEWBOX}. */
const PAD_OUTLINE =
  "M70,52 C40,47 22,72 20,112 C16,182 60,197 95,177 C110,168 120,152 132,152 " +
  "L168,152 C180,152 190,168 205,177 C240,197 284,182 280,112 C278,72 260,47 " +
  "230,52 C170,62 130,62 70,52 Z";

/** Pad Layouts keyed by Catalog id. Keyboards use {@link KEYBOARD_LAYOUT}. */
export const PAD_LAYOUTS: Record<string, PadLayout> = {
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

/** The pad Layout for a Catalog id, or `undefined` (e.g. for the keyboard). */
export function getPadLayout(catalogId: string): PadLayout | undefined {
  return PAD_LAYOUTS[catalogId];
}

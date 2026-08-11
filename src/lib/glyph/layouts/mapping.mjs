// Design-name → Catalog-id mapping for the authored controller SVGs in this
// folder. Consumed only by `build-layouts.mjs` at codegen time (the app and tests
// read the generated data, not this file).
//
// For each controller id, map the *design-tool name* of each interactive shape
// (its SVG `id`, or `data-name`) to the Catalog id it toggles. Layer names need
// NOT match Catalog ids. Any shape in the SVG whose name is NOT a key here is
// treated as decoration (the outline and any backers) and drawn, verbatim and
// non-interactive, behind the buttons.
//
// The codegen fails loudly if a name listed here isn't found in the SVG; the
// `layout.test.ts` bijection then checks the mapped result covers the Catalog
// exactly. Catalog ids for reference: xbox-{a,b,x,y,lb,rb,lt,rt,view,menu,
// left-stick,right-stick,dpad-up,dpad-down,dpad-left,dpad-right}; ps-{cross,
// circle,square,triangle,l1,r1,l2,r2,share,options,left-stick,right-stick,
// dpad-up,dpad-down,dpad-left,dpad-right}.

/** @type {Record<string, Record<string, string>>} */
export const LAYOUT_MAPPINGS = {
  xbox: {
    A: "xbox-a",
    B: "xbox-b",
    X: "xbox-x",
    Y: "xbox-y",
    LB: "xbox-lb",
    RB: "xbox-rb",
    LT: "xbox-lt",
    RT: "xbox-rt",
    View: "xbox-view",
    Menu: "xbox-menu",
    LS: "xbox-left-stick",
    RS: "xbox-right-stick",
    DPad_Up: "xbox-dpad-up",
    DPad_Down: "xbox-dpad-down",
    DPad_Left: "xbox-dpad-left",
    DPad_Right: "xbox-dpad-right",
  },
  // The mouse is not a pad and `mouse` is not a Catalog id — these keys map onto
  // *keyboard* Inputs. See ./README.md.
  //
  // `mouse1` is the body: an unused full-bleed guide rect holds `id="mouse"`, so
  // Affinity suffixed the real shape (its true name survives on `serif:id`, which
  // the codegen doesn't read). Rename or drop the guide rect and this becomes an
  // identity map.
  mouse: {
    mouse1: "mouse",
    "mouse-left": "mouse-left",
    "mouse-right": "mouse-right",
    "mouse-middle": "mouse-middle",
    "mouse-4": "mouse-4",
    "mouse-5": "mouse-5",
  },
  playstation: {
    Cross: "ps-cross",
    Circle: "ps-circle",
    Square: "ps-square",
    Triangle: "ps-triangle",
    L1: "ps-l1",
    R1: "ps-r1",
    L2: "ps-l2",
    R2: "ps-r2",
    Share: "ps-share",
    Options: "ps-options",
    LS: "ps-left-stick",
    RS: "ps-right-stick",
    DPad_Up: "ps-dpad-up",
    DPad_Down: "ps-dpad-down",
    DPad_Left: "ps-dpad-left",
    DPad_Right: "ps-dpad-right",
  },
};

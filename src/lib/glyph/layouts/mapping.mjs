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
  // playstation: {
  //   "Cross": "ps-cross",
  //   ...
  // },
};

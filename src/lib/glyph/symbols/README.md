# Authored Symbols & Backgrounds

The shipped **Symbols** (foreground Render Sources) and **Authored Backgrounds**
(bumper/trigger tiles) are authored as **one atlas SVG per source**, kept here.
Each atlas holds many assets as `<g id>` cells on a fixed grid; a codegen windows
each cell into a standalone square-viewBox SVG and bakes it, with the manifest,
into `symbols.generated.ts` (which the app and tests import). This follows the
same authored-SVG → codegen pattern as `../layouts/`.

## The workshop loop

1. Add/adjust the asset's row in `manifest.mjs` (`id`, `label`, `kind`, `atlases`).
2. Draw its cell in each atlas listed in `atlases` — `xbox-symbols.svg`,
   `playstation-symbols.svg`, `shared-symbols.svg` — as a `<g id="…">` on the grid.
3. Run `npm run symbols` to regenerate `symbols.generated.ts`.
4. Repeat. Un-drawn manifest ids are reported as `pending` and simply omitted
   from `SYMBOL_SVGS` until authored (callers fall back to the label).

## Authoring convention

- **Grid.** Cells are **256×256** units. Place each cell with
  `transform="translate(col, row)"` where `col`/`row` are multiples of 256
  (top-left cell is `translate(0, 0)`). Override the size with `data-cell="…"` on
  the root `<svg>` if needed.
- **Safe box.** Keep art inside the centered ~80% (≈205 units) of its cell so
  nothing clips when composited.
- **`id` = asset id, and ids are bare.** Each interactive cell's `<g>` `id` must
  equal a `manifest.mjs` id (e.g. `a`, `dpad-right`, `bumper`) — **no device
  prefix**. The atlas file a cell lives in is what scopes it to a Device, so both
  pads author their own `bumper` and neither name has to say which pad it is. Any
  group whose id isn't in the manifest is ignored (use it for guides / labels).
- **Draw an id once per atlas that needs it.** An asset's manifest `atlases` lists
  every file that draws it; the codegen errors if a cell appears in an atlas the
  manifest doesn't list, so the two can't drift. Device art is emitted as
  `<atlas>:<id>` and `getSymbolSvg(id, device)` picks the matching one. Only the
  genuinely cross-device art — this pass just the stick — lives in
  `shared-symbols.svg`, which is emitted unscoped and acts as the fallback for any
  Device that draws none of its own.
- **An atlas may name a cell in its own vocabulary.** Where a pad calls a control
  something else, put that name in the asset's `cells` map rather than renaming
  the asset: `cells: { playstation: "R1" }` lets `playstation-symbols.svg` label
  its bumper tile `R1` while it still resolves as `bumper`. The per-atlas name is
  an authoring convenience only — the emitted key and everything downstream use
  the bare asset id.
- **Derived directions.** Don't draw all four d-pad arrows: author only
  `dpad-right`; the codegen rotates it into `dpad-down`/`left`/`up`. Derived ids
  have a `rotateOf`/`rotate` in the manifest and **no** cell — authoring one is an
  error. Rotations are generated once per atlas the source is drawn in, so each
  Device's arrows come from its own art.
- **Colour = paint role (RGB sentinels).** Don't author with `currentColor` or
  real colours. Paint each shape in the **exact sentinel primary for the role it
  plays**, and the classifier keys on that colour (independent of fill vs. stroke):
  - **red `#f00` → fill** (primary ink)
  - **blue `#00f` → border** (outline)
  - **green `#0f0` → secondary** (highlight)

  Matching is **exact** (after `#rgb`/`rgb()` normalization), with three outcomes:
  a sentinel is a **role** (the tool recolours it); `none`/`transparent` (and
  `fill-opacity:0` guide boxes) are **ignored**; **any other visible colour is
  flagged** — kept as authored but reported by `npm run symbols` and the preview,
  so an off-primary export (e.g. `#f20d0d` instead of `#f00`) never slips through
  silently. The role→appearance mapping (e.g. an Xbox A rendered green) is the
  tool's job, not the atlas's. Background tiles (`kind: "background"`) are tinted
  by the Style Cascade fill. The palette + classifier live in `paint-roles.mjs`,
  shared by the codegen, preview, and app so they never diverge. See
  `docs/adr/0007-*`.

## Files

- `*-symbols.svg` — authored atlases, one per source (git-tracked). **Author these.**
- `manifest.mjs` — the asset list (`id`, `label`, `kind`, `atlases`). Edit this.
- `build-symbols.mjs` — the codegen (`npm run symbols`). Uses `jsdom`.
- `paint-roles.mjs` — the RGB sentinel palette (colour → role) and its classifier,
  shared by the preview and the tool. Edit here to change the convention.
- `preview-symbols.mjs` — dev gallery (`npm run symbols:preview`): regenerates, then
  opens an HTML page of every parsed symbol (windowed viewBox + rotation twins) in
  the browser, with live **fill / border / secondary** colour pickers that remap each
  authored paint role (classified from its sentinel colour via `paint-roles.mjs`) so
  you can preview colorization from the authored state. Writes to the OS temp dir;
  nothing lands in the repo.
- `symbols.generated.ts` — generated output. **Do not edit by hand.**

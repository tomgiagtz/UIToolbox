# ADR-0007: Sentinel paint roles and importable Symbol Sets

- **Status:** Accepted — partly built. §1, §2 and §3's `symbolPaints` cascade group
  are in the code; §4, §4a and §5 are decided and not yet built. See _Status of
  implementation_ below for what landed and what is still filed.
- **Date:** 2026-07-23, §4 extended with refresh reconciliation 2026-08-07
- **Amends:** ADR-0004 (Symbol colour model), ADR-0006 (adds a Style Cascade group)
- **Amended by:** ADR-0012 — §3's four tiers become three (the Catalog per-Input
  tier is deleted, so "the Device tier may set uniform role defaults; per-Input
  defaults outrank it" loses its middle term), and the brand palette no longer
  ships at a Catalog tier — it is Preset payload.
- **Amended by:** ADR-0014 — the Symbols sub-tool of §5 gets its home: the Symbol
  Sets section of the Assets window. The vocabulary is sharpened with it — a Set
  is the **shipment**, and each of its cells (a Symbol or an Authored Background)
  is an **Asset**.

## Context

ADR-0004 gave every Symbol a colour model of **tintable** (single-colour,
authored with `currentColor`, follows the label text colour) or **fixed-colour**
(brand art with baked colours), switched by a `tint` flag in the manifest. Two
things broke that model in practice:

1. **It can't express multi-part colouring.** A gamepad face button is a filled
   backer, an outline, and a glyph — the tool needs to recolour those parts
   independently (fill vs. border vs. highlight), which a single tint colour or a
   frozen fixed-colour asset cannot do.
2. **We want users to bring their own art.** The shipped atlas pipeline
   (`src/lib/glyph/symbols/`, issue #14) should generalize: anyone should be able
   to author a symbol atlas in a design tool and import it, not just the project
   owner editing the repo.

The `tint` flag was already removed when the issue #14 slice landed; this ADR
records the model that replaces it.

## Decision

### 1. Paint roles via an RGB sentinel palette

A Symbol's shapes are painted in **sentinel colours** that encode a **paint
role**, not an appearance. The classifier keys on colour, independent of
fill-vs-stroke:

| Sentinel           | Role          | Meaning     |
| ------------------ | ------------- | ----------- |
| `#f00` (`#ff0000`) | **fill**      | primary ink |
| `#00f` (`#0000ff`) | **border**    | outline     |
| `#0f0` (`#00ff00`) | **secondary** | highlight   |

Matching is **exact** after normalizing `#rgb`/`rgb()` shorthand. Every authored
paint resolves to exactly one of three outcomes (`inspectPaint`, `paint-roles.mjs`):

- **role** — an exact sentinel; the tool recolours it through the Style Cascade.
- **ignore** — `none` / `transparent` / a fully-transparent paint; renders
  nothing, carries no role, never flagged.
- **unknown** — any other _visible_ colour. It is **not** a role: the shape keeps
  its authored colour (literal pass-through) **and is flagged**. Flagging is a
  **non-blocking warning** (surfaced by `npm run symbols`, the dev preview, and
  the in-app import review) that lists the offending cell + colour. Nothing is
  silently dropped — the usual cause is an off-primary export (e.g. `#f20d0d`
  instead of `#f00`), which the author then corrects at the source.

The palette + classifier live in one shared, dependency-free module
(`paint-roles.mjs`), used by the codegen, the preview, and the app so they can't
diverge.

### 2. Structure-only invariant

Because the sentinel **occupies the paint channel entirely**, an authored SVG
carries **structure and roles only** — group `id` (= symbol id) and sentinel
colour. There is no room, and no license, to encode appearance, labels, kind, or
rotation in the art. **All appearance lives in configuration.** A shape's _real_
colour (an Xbox A rendered green) is never in the atlas; it is resolved from the
Style Cascade.

### 3. Role colours are a new Style Cascade group (extends ADR-0006)

`GlyphStyle`/`StyleOverride` gain a sparse **`symbolPaints { fill, border,
secondary }`** group, resolved through the same four tiers as everything else
(`Project → Device → Catalog-per-Input default → Glyph`), with the same
fall-up/reset behaviour. It is **independent of `textColor`** (labels keep
`textColor`; symbols use `symbolPaints`).

The brand palette ("A green, B red, X blue, Y yellow") ships at the
**Catalog-per-Input default** tier — this is what "device-scoped authored
defaults" means: per-Input role-colour defaults shipped with a device's catalog.
The Device tier may set _uniform_ role defaults (e.g. "all secondary = white on
this pad"); per-Input defaults outrank it; a Glyph edit outranks those.

### 4. Symbol Sets — bundled and imported are the same thing

A **Symbol Set** is a self-contained atlas of symbol cells. The shipped Xbox set
is just the pre-shipped instance; a user can **author and import** their own.

- **Format** — a single self-describing SVG: each symbol is an id'd `<g>` (or
  id'd shape) on a fixed square grid, painted in sentinels. On import, a cell id
  is matched against the **base Catalog first**; an unrecognized id becomes a new
  custom Input/symbol (the catalog extends, it isn't a ceiling).
- **Import review** — importing runs an in-browser windowing pass (the geometry
  that today lives in `build-symbols.mjs`) and shows a review screen: the
  windowed cells, which ids matched vs. are new, any non-sentinel **flags**, and
  controls to set the set's default role colours and correct labels before
  accepting.
- **Not every id'd node is a cell.** The shipped atlases are cross-checked
  against `manifest.mjs`; an import has no manifest, so it must decide for
  itself. A candidate whose bounding box overflows one grid square (a frame or a
  guide layer) or that draws nothing visible is **skipped, with its reason
  stated** — the same "never fail silently" rule the paint classifier follows.
- **Set defaults live in project config**, so they travel inside the ZIP project
  save file (as custom images do, ADR-0004) — not in the bare `.svg`, which by
  the structure-only invariant cannot carry appearance.
- **Refresh-from-path** — the import surface keeps a re-readable file reference
  (File System Access API `FileSystemFileHandle`) so an author can re-export from
  their design tool and **refresh** the same path, or pick a new one. Where the
  API is unavailable (Firefox/Safari), refresh degrades to re-picking the file.
  Only how the bytes arrive differs; the reconciliation below is identical.

#### 4a. Refresh reconciliation — the Set is exactly what the atlas draws

A refresh re-runs windowing and binding, then reconciles against the Set already
in the project. Two things are in tension: the **file** has moved on (art
redrawn, ids added or gone, off-primary colours corrected), while the
**project** holds importer edits and Glyphs already bound to these Symbols.

**The Set holds only the cells the file draws.** A Symbol the atlas stops
drawing is removed — including when a Glyph uses it. Nothing is retained behind
the drawing's back, and there is deliberately **no control to drop or
cherry-pick a single cell**: both would let a Set drift from the atlas it claims
to be, which is the failure this rule exists to prevent. A Set is a view of one
file, not a collection accumulated across versions of it.

What a refresh may **not** do is take art away _quietly_. Every Glyph left
without a Symbol is warned about **by id**, once before the importer accepts —
so they can cancel and fix the drawing instead — and again after. This is the
same shape as sentinel flagging: non-blocking, specific, and never silent.

A Glyph **keeps its Symbol id** when its Symbol goes away, falling back to its
label (the Render Source fallback ADR-0004 already specifies for an unsatisfiable
override). So restoring the cell in the drawing and refreshing restores the
Glyph, with no manual repair — which is what makes unconditional removal cheap
rather than destructive. Were the reference scrubbed instead, the warning would
be the only recovery path and the rule could not stand.

The rest of the reconciliation follows from the structure-only invariant — the
file owns structure, configuration owns everything else:

- **Art** always comes from the file; the project never edits it.
- **Labels** the importer typed survive a refresh; labels never touched re-derive
  from the Catalog, so a Catalog rename reaches Sets that never overrode it.
- **Role colours** are configuration (they travel in the project save file) and a
  refresh never touches them.
- **Flags** are recomputed each read: correcting an off-primary export at source
  and refreshing is the supported way to clear one.
- A **rename is indistinguishable from a delete plus an add** — an id is the only
  identity a cell has. The tool says so rather than guessing at a pairing, and
  edits made against the old id do not carry over.

### 5. Surface

Import, set management, and preview live in a dedicated **Symbols** sub-tool
(tab) of the Glyph Creator. It owns **sets** (import, cell mapping, set-level
defaults); the shared Style panel owns **per-Glyph** role colours, so the cascade
UI isn't forked.

## Consequences

- ADR-0004's tintable / fixed-colour / `tint` model is **superseded**. "Symbol"
  in the glossary is rewritten; **Symbol Set** and **Paint Role** are added.
- ADR-0006's cascade gains the `symbolPaints` group and its flattened
  `StyleField`s (`symbolFill`, `symbolBorder`, `symbolSecondary`).
- The windowing codegen must gain a browser-runtime home for import; the Node
  codegen (`npm run symbols`) stays for the shipped atlases. The browser home is
  **small**: `build-symbols.mjs` hand-rolls bounding boxes only because jsdom has
  no layout, and `getBBox()` reproduces its output exactly (verified against
  every `xbox-symbols.svg` cell). Only measurement differs between the two — the
  grid-snap, binding, and reconciliation are shared, and should live in one
  DOM-free module for the same reason `paint-roles.mjs` does.
- A Set's cells can be removed by a refresh, so anything keyed to a Symbol id
  must tolerate that id vanishing and returning. Glyphs already do (they fall
  back to their label); nothing else may assume a Symbol id is permanent.
- Exact-match + flagging makes the sentinel values a **published contract**: the
  authoring docs and a starter swatch must state `#f00` / `#00f` / `#0f0` so
  authors don't guess an off-primary and get flagged.
- Trademark/licensing risk noted in ADR-0004 is unchanged; imported sets are
  user-supplied, so brand-likeness of user art is the user's responsibility.

## Status of implementation

The asset pipeline, the sentinel palette, and the three-outcome classifier +
flagging landed with the issue #14 slice; the `symbolPaints` cascade extension
has since landed too (`src/lib/glyph/style.ts`, `symbol-render.ts`, and the Style
panel in `src/app/tools/glyph-creator/style-controls.tsx`) — though not §3's brand
palette, which ADR-0012 moved out of the Catalog tier and into Preset payload, and
which nothing ships yet. What remains is §4 and §4a — the browser windowing,
import review, and refresh-from-path (#38) — and §5, the Symbols sub-tool UI
(#39). Until those land there is no Symbol Set import: the shipped Sets are
authored in the repo and compiled in by `npm run symbols`.

§4a was settled ahead of implementation by a prototype (issue #38, branch
`proto/38-symbol-set-import`) that drove the reconciliation through the awkward
cases by hand. The review screen's **layout** is deliberately not settled here.

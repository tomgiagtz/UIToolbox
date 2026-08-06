# ADR-0007: Sentinel paint roles and importable Symbol Sets

- **Status:** Accepted
- **Date:** 2026-07-23
- **Amends:** ADR-0004 (Symbol colour model), ADR-0006 (adds a Style Cascade group)
- **Amended by:** ADR-0012 — §3's four tiers become three (the Catalog per-Input
  tier is deleted, so "the Device tier may set uniform role defaults; per-Input
  defaults outrank it" loses its middle term), and the brand palette no longer
  ships at a Catalog tier — it is Preset payload.

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
  controls to set the set's default role colours (which populate its
  Device/Catalog-per-Input tiers) and correct labels before accepting.
- **Set defaults live in project config**, so they travel inside the ZIP project
  save file (as custom images do, ADR-0004) — not in the bare `.svg`, which by
  the structure-only invariant cannot carry appearance.
- **Refresh-from-path** — the import surface keeps a re-readable file reference
  (File System Access API `FileSystemFileHandle`) so an author can re-export from
  their design tool and **refresh** the same path, or pick a new one. Where the
  API is unavailable (Firefox/Safari), refresh degrades to re-picking the file.

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
  codegen (`npm run symbols`) stays for the shipped atlases.
- Exact-match + flagging makes the sentinel values a **published contract**: the
  authoring docs and a starter swatch must state `#f00` / `#00f` / `#0f0` so
  authors don't guess an off-primary and get flagged.
- Trademark/licensing risk noted in ADR-0004 is unchanged; imported sets are
  user-supplied, so brand-likeness of user art is the user's responsibility.

## Status of implementation

The asset pipeline, the sentinel palette, and the three-outcome classifier +
flagging landed with the issue #14 slice. The `symbolPaints` cascade extension,
the browser windowing + import review + refresh-from-path, and the Symbols
sub-tool UI are tracked as follow-up work.

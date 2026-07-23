# UIToolbox — Context

UIToolbox is a collection of browser-based tools for game developers. The first
(and, today, only) tool is the **Input Glyph Creator**: it turns a font + style

- a list of controls into engine-ready sprite atlases of input prompts.

Everything runs client-side — no accounts, no server-side generation, no upload
of the user's fonts or settings.

## Glossary

The **ubiquitous language** for the Input Glyph Creator. Code, tests, issues, and
UI copy should use these terms and avoid the synonyms noted.

### Glyph

A single rendered control image: one **Render Source** composited onto a
generated **Background** tile. The Render Source is one of a font-drawn
**label**, a bundled **Symbol**, or a user-uploaded **custom image** — all fit
into the same tile content box (see ADR-0004, which amends ADR-0002). One Glyph
occupies one cell of a **Sprite Atlas**.

_Avoid:_ "icon", "button image" (use Symbol / custom image for the artwork
sources).

### Input

A single control the user cares about, e.g. `A`, `Space`, `LMB`, `Right Stick`.
An Input always carries a **label string**, which is its identity and the source
of its **Sprite Name** even when it renders as artwork. Its **Render Source**
(label / Symbol / custom image) decides how its one Glyph is drawn. A **Device**
owns an ordered list of Inputs.

_Avoid:_ "key", "button" as the domain type — those are Inputs on a specific
Device.

### Render Source

How an Input's Glyph content is drawn: its font-rendered **label** (default for
arbitrary Inputs), a bundled **Symbol** (default for well-known Inputs), or a
user-uploaded **custom image**. Whichever source is chosen is composited onto the
same Background tile.

### Symbol

A default artwork asset for a well-known Input (Triangle, Space, Enter, D-pad Up,
Shift…). A Symbol is an **SVG** keyed by a stable `id`, drawn from a **Symbol
Set**. Its shapes are painted in **Paint Role** sentinels, not real colours, so
the tool recolours each role (fill / border / secondary) through the Style
Cascade; a Symbol's appearance is never baked into its art. Well-known Inputs
default to their Symbol; the user can toggle back to the label. Distinct from a
**custom image**, which the user supplies as a single per-Glyph graphic.

_Avoid:_ "icon", "default image" — use Symbol for artwork; "tintable" /
"fixed-color" (the retired ADR-0004 model — see ADR-0007).

### Symbol Set

A self-contained atlas of Symbols — one SVG whose id'd cells sit on a fixed
square grid, each painted in **Paint Role** sentinels. The tool ships a default
Set (e.g. the Xbox pad); users can **author and import** their own. On import,
each cell `id` is matched against the base **Catalog** first, and an
unrecognized id becomes a new **custom Input**. By the _structure-only
invariant_, the SVG carries only ids + role sentinels — never labels, kind,
rotation, or appearance; those live in configuration, so an imported Set's
default colours travel in the ZIP project save file, not the bare `.svg`.

_Avoid:_ "sprite sheet" (that's the exported **Sprite Atlas**), "icon pack".

### Paint Role

The job a Symbol shape's colour encodes, via an exact **RGB sentinel**: `#f00` →
**fill** (primary ink), `#00f` → **border** (outline), `#0f0` → **secondary**
(highlight). The classifier keys on colour, not fill-vs-stroke, with three
outcomes: a sentinel is a **role** (recoloured via the Style Cascade); `none` /
`transparent` is **ignored**; any other visible colour is **unknown** — kept as
authored (literal pass-through) and **flagged** (a non-blocking warning), so an
off-primary export never fails silently. See ADR-0007.

_Avoid:_ "tint" — a role is a slot the cascade fills, not a single wash colour.

### Device

An **Input Device** — a named device, e.g. Keyboard, Xbox pad, PlayStation pad.
Each Device offers a fixed **Catalog** of known Inputs, arranged in a **Device
Layout**; the user **enables** a subset and may add **custom Inputs** not in the
Catalog. Each Device with at least one enabled or custom Input produces one
**Sprite Atlas** + one metadata file.

_Avoid:_ "platform", "controller" (a controller is one kind of Device).

### Catalog

The fixed set of **known Inputs** a Device offers — every keyboard key, every pad
button. Each Catalog entry carries a stable id, a default label, an optional
default **Symbol**, and a position in the **Device Layout**. Users toggle Catalog
Inputs on/off; only **enabled** ones generate Glyphs. Inputs the Catalog lacks
are added as **custom Inputs**.

### Device Layout

The **code-drawn schematic** used to render a Device's Catalog for selection:
a standard US-staggered rounded-rect keycap board for the Keyboard, and clustered
**Symbol nodes** (d-pad, face-button diamond, bumpers/triggers) for the pads.
It is **editor chrome only** — a picker for enabling Inputs — and is never part
of an exported Sprite Atlas. No layout art is authored; the only authored assets
are the Symbols.

_Avoid:_ "silhouette", "controller art" — the Layout is schematic, not artwork.

### Preset

The **default-enabled subset** of a Device's Catalog — which Inputs start enabled
when the tool loads. The Keyboard Preset enables ~24 common gaming keys (the rest
of the board sits disabled in the Layout); the pad Presets enable their whole
Catalog. A Preset is a starting selection, freely changed afterward.

### Background

The tile a Glyph's Render Source is drawn on. Its **source** is one of:

- a **shape** — rounded-rect / square / circle / none, with a **fill** color and
  optional **border** (color + width); "none" yields a transparent, content-only
  Glyph;
- an **uploaded image** — the user's own tile graphic; or
- an **authored Background** — a shipped SVG tile from the tool's gallery.

The Background source resolves through the **Style Cascade** like any other style
property. Some Catalog Inputs whose identity is their tile _shape_ (bumpers,
triggers) default to a specific authored Background rather than a plain shape.

### Authored Background

A shipped SVG tile graphic the project owner authors (a growing gallery),
selectable as a Background source. Distinct from a **Symbol** (foreground Render
Source content): an Authored Background is the _tile_, a Symbol is what's drawn
_on_ it. Bumper- and trigger-shaped tiles are Authored Backgrounds; their label
(e.g. `LB`, `RT`) is the Render Source drawn on top.

### Style Cascade

How a Glyph's style + Render Source are resolved, lowest precedence to highest:

**Project** defaults → **Device** overrides → **Catalog per-Input default** →
**Glyph** overrides.

Each level is a sparse subset; anything unset falls up the chain. Every Background
property (source, shape, corner radius, fill, border width+color) and the text
color can be set at any level. The **Catalog per-Input default** tier is what lets
a bumper keep its authored Background even when its Device is set to "circle" —
the shipped per-Input default outranks a device-wide override, and only an
explicit Glyph edit outranks it. `cellSize` and the **font** are the exception:
they stay Project-global (uniform grid, one font).

### Sprite Atlas

A single **power-of-two** PNG image packing all of one Device's Glyphs into a
grid of cells. Power-of-two dimensions keep it compatible with engines and
mipmapping that require them. Each Atlas ships with a **TexturePacker-format**
metadata file (see ADR-0003).

_Avoid:_ "sprite sheet", "tileset" — use Sprite Atlas for the generated output.

### Sprite Name

The identifier the game engine uses to look up a Glyph inside a Sprite Atlas.
Derived from an Input's label via `slugify` (normalization into a safe
identifier — mandatory, exports break otherwise) plus a user-controlled
**template** (`{device}`, `{input}`, `{index}` tokens; default `{device}_{input}`)
and a **case** style (snake_case / kebab-case / camelCase).

## Core seams

These are named here so later tickets share the vocabulary; they are **not**
implemented by the walking-skeleton ticket.

- **`generateTilesets(project) → DeviceOutput[]`** — the single high core seam.
  Takes the full project config; returns plain data per Device (`atlasSize`, and
  per Glyph a `spriteName` + cell rect, plus the TexturePacker metadata
  document). All packing / naming / sizing / metadata logic lives behind it; the
  React/Next layer is a thin shell over it.
- **`Packer.place(glyphs, opts) → { atlasSize, placements[] }`** — swappable
  packing strategy. v1 is a uniform grid (fixed cells, 2px gutter, each atlas
  dimension padded up to the next power-of-two).
- **`Exporter`** — produces the atlas PNG + TexturePacker-format JSON (ADR-0003).
- **`ProjectStore`** — persistence: config in `localStorage`, uploaded font blob
  in IndexedDB; both restored on load.

## Decisions

See `docs/adr/`:

- **ADR-0001** — Web stack (Next.js App Router + TS, Tailwind + shadcn/ui,
  Storybook, Vitest + Playwright, fully client-side).
- **ADR-0002** — Glyphs are font-rendered, not device artwork.
- **ADR-0003** — TexturePacker-format JSON as the single metadata format.
- **ADR-0004** — Symbols + custom images as Glyph Render Sources (colour model
  amended by ADR-0007).
- **ADR-0005** — Device layout selection model.
- **ADR-0006** — Glyph style resolves through a Project → Device → Glyph cascade
  (extended by ADR-0007).
- **ADR-0007** — Sentinel paint roles and importable Symbol Sets.

# UIToolbox — Context

UIToolbox is a collection of browser-based tools for game developers. The first
(and, today, only) tool is the **Input Glyph Creator**: it turns a font + style
+ a list of controls into engine-ready sprite atlases of input prompts.

Everything runs client-side — no accounts, no server-side generation, no upload
of the user's fonts or settings.

## Glossary

The **ubiquitous language** for the Input Glyph Creator. Code, tests, issues, and
UI copy should use these terms and avoid the synonyms noted.

### Glyph

A single rendered control image: a **label** drawn in the user's chosen font,
centered on a generated **Background** tile. A Glyph is produced by drawing, not
by selecting device artwork — there are no per-device image assets (see
ADR-0002). One Glyph occupies one cell of a **Sprite Atlas**.

_Avoid:_ "icon", "button image" (both imply pre-drawn artwork).

### Input

A single control the user cares about, e.g. `A`, `Space`, `LMB`, `Right Stick`.
Internally an Input is just a **label string**. A **Device** owns an ordered list
of Inputs. Each Input renders to exactly one Glyph.

_Avoid:_ "key", "button" as the domain type — those are Inputs on a specific
Device.

### Device

An **Input Device** — a named grouping of Inputs, e.g. Keyboard, Xbox pad,
PlayStation pad. A Device is a _grouping_, not a render variant: no image assets
differ per Device. Each selected Device produces one **Sprite Atlas** + one
metadata file.

_Avoid:_ "platform", "controller" (a controller is one kind of Device).

### Preset

A starting, **editable** list of Inputs seeded onto a Device (the tool ships a
Keyboard Preset). The user freely selects, removes, and adds Inputs afterward —
a Preset is a convenience seed, not a fixed set.

### Background

The tile a Glyph's label is drawn on: a **shape** (rounded-rect, square, circle,
or none), a **fill** color, and an optional **border** (color + width). A "none"
Background yields a transparent, label-only Glyph.

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

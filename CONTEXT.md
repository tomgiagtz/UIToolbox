# UIToolbox — Context

UIToolbox is a collection of browser-based tools for game developers. The first
(and, today, only) tool is the **Input Glyph Creator**: it turns a font, a style,
and a list of controls into engine-ready sprite atlases of input prompts.

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
of its **Sprite Name** even when it renders as artwork. It may also carry
**aliases** — other names the same control is known by, chiefly the other pad's
word for it (an Xbox `RB` is a PlayStation `R1`). Aliases are for **lookup only**:
they never replace the label, so they can't change what a Glyph renders or what
its Sprite Name becomes. Its **Render Source** (label / Symbol / custom image)
decides how its one Glyph is drawn. A **Device** owns an ordered list of Inputs.

_Avoid:_ "key", "button" as the domain type — those are Inputs on a specific
Device.

### Render Source

How an Input's Glyph content is drawn: its font-rendered **label** (default for
arbitrary Inputs), a bundled **Symbol** (default for well-known Inputs), or a
user-uploaded **custom image**. Whichever source is chosen is composited onto the
same Background tile, sized and oriented by its **content transform**.

The default comes from the Catalog — a well-known Input draws its Symbol, anything
else its label — and any Glyph can override it through the **Style Cascade**. An
override the project can't satisfy falls back to that default rather than failing:
a Symbol pick on an Input that ships none, or an image whose bytes aren't present.
The label is retained either way, since it stays the Input's identity and the
source of its **Sprite Name**.

### Custom image

A user-uploaded image or SVG drawn as one Glyph's Render Source. Unlike a
**Symbol** it is never recoloured — it draws as authored — and unlike a Symbol it
is fitted to its own aspect rather than filling the square content box. The
project config carries only a **manifest** describing the image; the bytes live
in IndexedDB and travel inside the ZIP project save file (ADR-0008).

### Font

A typeface a Glyph's **label** is drawn in, named by its **family** — the one
thing the draw path needs. A project can use several: the family is a **Style
Cascade** property, so a Device or a single Glyph can use a different face from
the project's.

Fonts come from two places. A **bundled family** ships with the tool and is
listed in code; an **uploaded font** is the user's own file, whose family is
generated at upload so it can never collide. Uploads are manifested on the
project the way custom images are — bytes in IndexedDB, carried in the ZIP —
while bundled families are never manifested and never travel, since the tool
already has them. A **Preset** may only name a bundled family, never carry bytes.

_(ADR-0012, decided and not yet built. Today a project has exactly one font.)_

### Transform

A rotation in degrees plus a **signed per-axis scale**, applied to one whole
drawing layer. A Glyph has two independent ones — a **background transform** on
the tile and a **content transform** on whichever Render Source is drawn — and
both resolve through the **Style Cascade** at every tier. A negative scale
component mirrors that axis, which is how a left-side bumper faces the other way;
that reads unambiguously only because rotation sits beside it. The content
transform scales whichever Render Source a Glyph happens to use, so switching
sources never discards the sizing. Above `1` a layer is clipped to its own cell,
so a large or rotated Glyph can't paint its neighbour in the atlas.

_Avoid:_ "content scale", "flipX" — both are folded into a Transform (ADR-0012).

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

### Cluster art

A Symbol whose artwork depicts a whole group of Inputs and emphasises one of
them, rather than depicting its own Input alone — the d-pad Symbols draw all four
arms with one highlighted. Correct in an exported **Glyph**, where the cell
stands on its own, but a **Device Layout** skips it: the Layout already draws the
cluster as separate nodes, so nesting the art inside one of them would show a
whole d-pad inside a quarter of itself. Marked as cluster art in the Symbol Set
manifest.

_Avoid:_ "composite Symbol", "group icon" — cluster art is about what the art
_depicts_, not how it is built.

### Symbol Set

A self-contained atlas of Symbols — one SVG whose id'd cells sit on a fixed
square grid, each painted in **Paint Role** sentinels. Cell ids are **bare**: the
Set a cell lives in is what scopes it to a **Device**, so the Xbox and
PlayStation Sets both author `bumper` and `dpad-right` and each resolves to its
own art. A Set of genuinely cross-device art is the fallback for any Device that
ships none of its own. The tool ships a default
Set (e.g. the Xbox pad); users can **author and import** their own. On import,
each cell `id` is matched against the base **Catalog** first, and an
unrecognized id becomes a new **custom Input**. By the _structure-only
invariant_, the SVG carries only ids + role sentinels — never labels, kind,
rotation, or appearance; those live in configuration, so an imported Set's
default colours travel in the ZIP project save file, not the bare `.svg`.

_Avoid:_ "sprite sheet" (that's the exported **Sprite Atlas**), "icon pack".

### Paint Role

The job a Symbol shape's colour encodes, via an exact **RGB sentinel** — one
reserved colour per role: **fill** (primary ink), **border** (outline),
**secondary** (highlight). The classifier keys on colour, not fill-vs-stroke,
with three outcomes: a sentinel is a **role** (recoloured via the Style Cascade);
`none` / `transparent` is **ignored**; any other visible colour is **unknown** —
kept as authored (literal pass-through) and **flagged** (a non-blocking warning),
so an off-primary export never fails silently. See ADR-0007.

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
button. **A Catalog says what is present** (ADR-0012): each entry carries a stable
id, a default label, a position in the **Device Layout**, and which shipped art
_depicts_ that control — its **Symbol**, and for bumpers and triggers an
**Authored Background** plus a mirror flag for the left-side ones. Those art
fields are **Seeds**, not styling: they name the tile a control _is_, which is
true under any look. An entry may also seed _no_ background, as the sticks do. A Catalog is code-maintained; a **Preset** points at one and
can never replace it. Users toggle Catalog Inputs on/off; only **enabled** ones
generate Glyphs. Inputs the Catalog lacks are added as **custom Inputs**.

### Device Layout

The **code-drawn schematic** used to render a Device's Catalog for selection:
a standard US-staggered rounded-rect keycap board for the Keyboard, and clustered
**Symbol nodes** (d-pad, face-button diamond, bumpers/triggers) for the pads.
It is **editor chrome only** — a picker for enabling Inputs — and is never part
of an exported Sprite Atlas. No layout art is authored; the only authored assets
are the Symbols.

_Avoid:_ "silhouette", "controller art" — the Layout is schematic, not artwork.

### Default Selection

The **default-enabled subset** of a Device's Catalog — which Inputs start enabled
when a Device is created. The Keyboard's Default Selection is a small
common-in-games subset (the rest of the board sits disabled in the Layout); the
pads' cover their whole Catalog. It is a starting selection, freely changed
afterward, and it is what a **Preset** seeds a Device from when your project
doesn't have that Device yet.

_Avoid:_ "Preset" for this — that word now names the shipped look (ADR-0012).

### Preset

A shipped starting **look**: **a Preset says what it looks like**, where a
**Catalog** says what is present (ADR-0012). Preset is a **role**, not a format —
_ships with the tool and appears in the picker_ — so a user's own export is not
one; you make a Preset by committing it and listing it.

A Preset is **style-only**. A **Device Preset** carries one Device's style,
per-Glyph styles, and font family; a **Project Preset** does the same and also
writes the Project tier. Neither carries `enabled`, `custom`, `name`, the export
settings, or any bytes — never font bytes (it may only name a **bundled family**)
and never an uploaded image. Applying one restyles the Devices you have and never
touches your selection unless you take a Device explicitly; a Device you lack can
be created from its Catalog's **Default Selection**.

Because a Preset restyles _your_ selection, the picker card promises nothing —
**the preview does**. A card is a fixed swatch, a name, and one pill per Device
covered; a live pane renders your actual atlas through the real cascade before
you commit.

_(ADR-0012, decided and not yet built.)_

### Background

The tile a Glyph's Render Source is drawn on. Its **source** is one of:

- **none** — nothing is drawn behind the content at all, not even inherited tile
  art, yielding a transparent, content-only Glyph;
- a **shape** — a drawn primitive, with a **fill** color and optional **border**;
- an **authored Background** — a shipped SVG tile from the tool's gallery; or
- an **uploaded image** — the user's own tile graphic.

The source is a single value, not a bag of flags — one of the four at a time
(ADR-0009) — and it is replaced wholesale, never merged. It is settable at every
tier of the **Style Cascade**, though a Catalog **Seed** outranks all but a Glyph
override. "None" is a _source_ rather than a fourth shape because a shape could
only ever suppress the drawn primitive, leaving an inherited authored tile still
showing. Catalog Inputs whose identity is their tile _shape_ (bumpers, triggers)
**seed** a specific authored Background rather than a plain shape. Fill, border,
corner radius, shape and the **background transform** all cascade normally; fill
and border paint a shape or recolour an authored tile, while an uploaded image
draws as authored, fitted to the cell and never recoloured.

### Authored Background

A shipped SVG tile graphic the project owner authors (a growing gallery),
selectable as a Background source. Distinct from a **Symbol** (foreground Render
Source content): an Authored Background is the _tile_, a Symbol is what's drawn
_on_ it. Bumper- and trigger-shaped tiles are Authored Backgrounds; their label
(e.g. `LB`, `RT`) is the Render Source drawn on top.

### Style Cascade

How a Glyph's style + Render Source are resolved, lowest precedence to highest:

**Project** base → **Device** overrides → **Glyph** overrides.

The Project tier is a full style; each tier above it is a sparse subset, and
anything unset falls up the chain. Every property — colour, shape, border, the
Background's **source**, font and the layer **transforms** — is settable at any
tier. The Project base always carries a source, being a full style rather than a
sparse override.

Three tiers **plus seeded values**: a Catalog **Seed** ranks between the Glyph
and Device tiers, so a bumper keeps its authored tile against a project- or
device-wide source, and only a per-Glyph override replaces it. Deleting
ADR-0006's Catalog per-Input tier removed a style tier, not a precedence
position — what survives is an ordering fact about the fields a Catalog seeds.

The grid **cell size** is the one exception: it stays Project-global for a
uniform grid, and lives in the project's export settings.

_(The font is ADR-0012, decided and not yet built: today it stays
Project-global.)_

### Seed

A Catalog-supplied starting value, ranked above the **Device** tier and below a
**Glyph** override (ADR-0012 §2). A seed is **not** a cascade tier and not a
selectable scope: it is not a style override, it is not user-editable, and it
supplies only what it seeds. It says what a control _is_ — a bumper is
bumper-shaped under any look, and a left-side one faces the other way — which is
the same kind of statement `symbolId` makes.

Two facts are seeded, each on its own: the Background **source**, and for the
four left-side shoulders a `scale.x` of −1 on the tile's **Transform**. The
Catalog stores the second as a bare `mirrored` boolean and never a transform
fragment, so the one file that may only say what is _present_ cannot grow a
`rotation: 15`.

A seed is tri-state: an Input may name a tile, may seed _no_ background at all
(the sticks, whose Symbol draws its own ring), or may be unseeded and fall
through like any other Input. Because a seed is a base rather than pre-filled
user data, resetting a Glyph lands back on the shipped tile rather than on the
Device tier.

Because a seed outranks the Device tier, a **device-wide** source change no-ops
on the eight seeded shoulder Inputs, and the only escape is a per-Glyph override.

### Sprite Atlas

A single **power-of-two** PNG image packing all of one Device's Glyphs into a
grid of cells. Power-of-two dimensions keep it compatible with engines and
mipmapping that require them. Each Atlas ships with a **TexturePacker-format**
metadata file (see ADR-0003).

_Avoid:_ "sprite sheet", "tileset" — use Sprite Atlas for the generated output.

### Export Bundle

What one Export produces. The user picks which **Devices** and which file types
(**Sprite Atlas** PNG, TexturePacker metadata JSON) they want; everything picked
arrives as a single download — the bare file when it's the only one, otherwise a
flat `{project-name}.zip` of the lot. Distinct from the **project save file**,
which is the editable config plus its assets rather than engine-ready output.

### Sprite Name

The identifier the game engine uses to look up a Glyph inside a Sprite Atlas.
Derived from an Input's label via `slugify` (normalization into a safe
identifier — mandatory, exports break otherwise) plus a user-controlled
**template** — a pattern interpolating the Device, the Input, and its index —
and a **case** style.

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
  (extended by ADR-0007; amended by ADR-0012, which cuts it to three tiers and
  brings the font in).
- **ADR-0007** — Sentinel paint roles and importable Symbol Sets (§3's tier count
  and its brand-palette tier amended by ADR-0012).
- **ADR-0008** — Custom image bytes persist in IndexedDB (amends ADR-0004), and
  content scale joins the Style Cascade (content scale replaced by a Transform in
  ADR-0012).
- **ADR-0009** — A Background's tile art is one `source` union: none / shape /
  authored / uploaded image (amends ADR-0006; `flipX` removed by ADR-0012).
- **ADR-0010** — The persisted config is validated against the current shape
  only: no version stamp, no migration; a config that fails is discarded and the
  loss is reported (amends ADR-0009).
- **ADR-0011** — Loading a project replaces the custom-image set outright, and a
  save reads bytes from the runtime registry rather than IndexedDB (amends
  ADR-0008).
- **ADR-0012** — _Accepted, partly built._ A **Catalog** says what is present; a
  **Preset** says what it looks like. Catalogs stay code-maintained registries and
  absorb the shipped tile art as seeds; the Style Cascade drops to three tiers,
  gains the font and two layer Transforms, and loses `contentScale`. A Preset is
  style-only, ships as build-time-validated code rather than a parsed file, and is
  promised by a live preview rather than by its picker card. Amends ADR-0006,
  ADR-0007 §3, ADR-0008 and ADR-0009 — the glossary entries above are flagged
  where they run ahead of the code.

# ADR-0014: One Assets window owns _having_ art; the Style panel owns _picking_ it

- **Status:** Accepted, partly built
- **Date:** 2026-08-18
- **Amends:** ADR-0008 and ADR-0011 (closes the per-image delete both left open),
  ADR-0007 §5 (names the home its Symbols sub-tool asked for)

## Context

The Style panel does two unrelated jobs at once, and every gap in the tool's
handling of art has opened along the seam between them.

**Picking** is a statement about the scope being edited: _this Glyph draws that
image_. It belongs beside the other Style Cascade controls, and it works.

**Having** is a statement about the project: _this project carries these three
uploads, and can draw these shipped Symbol Sets._ It has no home at all. The
image manifest is rendered only inside two pickers, as `<option>` text. So:

- a **custom image** can be added and never removed. `Project.images` only grows
  — the reducer has `add-image` and no counterpart — so a mistaken upload keeps
  its bytes in IndexedDB and ships in every project ZIP for the life of the
  project. This is ADR-0008's open consequence, narrowed by ADR-0011 (a load
  replaces the whole image set) but explicitly left open within one project.
- artwork is chosen from plain dropdowns, so the user picks art they cannot see:
  **Authored Backgrounds** are a list of ids and custom images a list of
  filenames (#45).
- a **Symbol Set** has nowhere to be imported, reviewed, or configured — the
  sub-tool ADR-0007 §5 asked for and #39 tracks.
- an uploaded **font** has the same one-way manifest as an image, for the same
  reason.

These are one missing surface, not four gaps. Answering them one at a time — a
delete button inside a `<select>`, a thumbnail grid in a 640px panel column, a
Set importer somewhere else again — leaves the project's art still unviewable as
a whole.

### The word "Asset"

An **Asset** is one thing the project can draw with, existing independently of
any Glyph pointing at it. An Asset has one of two **provenances**: it **ships**
with the tool (code, always present, never travels) or it is **uploaded** (the
user's own bytes, manifested on the project, carried in the ZIP). That split is
not new — it is exactly what `pickableFonts` already draws between a bundled
family and an upload.

`ImageAsset` and `FontAsset` in the code name only the _uploaded_ half, and stay
correct rather than becoming misnomers: a manifest exists precisely because
uploads need one and shipped art does not.

**A Symbol Set is not an Asset. It is the shipment that carries them.** One Set
is one SVG file holding many id'd cells; each _cell_ is an Asset. A **Symbol** is
an Asset and an **Authored Background** is an Asset, and the two are the same
kind of thing — cells of the same four atlas files, distinguished only by
`SymbolAsset.kind`. `SYMBOLS` and `AUTHORED_BACKGROUNDS` are one array filtered
two ways.

That has a consequence worth stating, because it looks like an omission: there
is no separate mechanism for removing an Authored Background. Removing either
cell kind means removing or replacing the Set it arrived in, which is one job,
filed as #39.

The name **Symbol Set** under-describes its contents, since a Set carries
Authored Backgrounds too. That is accepted rather than overlooked: the term is
load-bearing across ADR-0007, `src/lib/glyph/symbols/`, `npm run symbols` and
`SYMBOL_ASSETS`, and renaming it buys accuracy at the price of churn through
every one of them.

A **Sprite Atlas** is not an Asset either — it is output, not input.

## Decision

**One Assets window owns having. The Style panel keeps picking, and nothing
else.**

### 1. The window manages; it never picks

The window answers "what does this project have?". It never learns what a
`StyleScope` is, and no selection is made in it.

Picking stays in the Style panel because the two want opposite organisations.
The window is grouped by **kind**, which is how management works — you remove an
image, you import a Set. Picking is grouped by **role**: the user asks what goes
in the foreground, or what goes on the tile, and those cut across kinds. ADR-0009
is explicit that one upload can be one Glyph's Render Source and another's
Background tile, so an image belongs to both roles and neither. A window serving
both would organise itself by kind in one mode and by role in the other.

### 2. A bespoke shell, not the shared `Modal`

A large centred `<dialog>` over the editor, opened from the project menu bar. The
project lives in a `useReducer` in `glyph-creator.tsx`; a sibling route would
have to lift or persist that mid-edit for no gain, and managing assets
interrupts editing rather than being somewhere you navigate to.

`modal.tsx` stays the **form** dialog — open, choose, submit, gone — which is
what Save and Export are. The Assets window has no submit and its actions each
take effect immediately, so it takes its own shell over shared chrome (the
backdrop, the `<dialog>`, the labelled heading) rather than growing `Modal` a
size flag, an optional form, and eventually the `dismissible: false` that #81
wants. Two callers sharing a name and nothing else is the outcome that avoids.

### 3. Three sections, by Asset kind

- **Images** — the project's uploaded custom images. Upload, Used/Unused,
  remove, remove-unused.
- **Fonts** — bundled families and the project's uploads. Upload only; removal
  is not built.
- **Symbol Sets** — import, cell-mapping review, per-set default role colours,
  and the non-sentinel flags ADR-0007 §4–§5 specify. Not built (#39).

Shipped art appears beside uploads because the user's question is "what can I
draw with?", not "what did I upload?". Only uploads can be removed.

There is no Backgrounds section: an Authored Background is a Set cell, so it
belongs to Symbol Sets.

### 4. The boundary with the cascade

The window owns Assets and never owns style. Per-Glyph **Paint Role** colours
stay in the Style panel's `symbolPaints` group; a **Set's default** role colours
are configuration of that Set and live in the window. #39 states this as "don't
fork the cascade UI", and it is the one rule keeping the two surfaces from
growing into each other.

The same boundary decides a case that arises immediately. Removing an image that
the **Project** base uses as its Background source cannot clear the field — the
base is a total `GlyphStyle`, which is why `clearStyle` no-ops at that tier — so
it writes `{ kind: "shape" }`, the default source, and changes nothing else. The
base keeps the shape, fill, corner radius and border it already had. Removal must
not restyle: a per-Device shape default (a rounded rect on a keyboard, a circle
on a pad) is a **look**, so it is Preset payload under ADR-0012 and filed
separately, not a side effect of a delete.

Adding a **Device** raises the same case from the other end. `bumper` and
`trigger` are authored by the pads and by nothing else, so a Keyboard arriving in
a pad-only project strands a Project-tier authored source: the pads still draw
it, but the new Device resolves to no art. The value comes **down** rather than
away — copied onto every Device that has no source of its own, with the base
taking the default — so only the tier holding it moves and nothing already on
screen changes appearance. A Device that already overrides the field keeps its
own choice, since it was ignoring the base anyway. With no Devices to receive it
there was nothing drawing it either, so defaulting the base alone is still no
restyle.

It does not climb back up when that Device is removed again. Re-establishing it
as a project-wide default is a manual round trip — set the Project tier, then
reset the Device override — and that is the intended cost: a rise-back-up would
be a second implicit style write, which is exactly what this section and §5 both
push against.

Only `background.source` is demoted. It is the one Project-tier field a Device
can fail to honour; the base carries no `renderSource` at all, and everything
else it holds is drawable by every Device.

### 5. Removal is always explicit

Two gestures, both user-driven, deliberately asymmetric:

- **Remove** one image. Confirmed inline — the button becomes a confirm rather
  than opening a dialog — whether or not anything references it.
- **Remove unused**, which by construction can only drop rows nothing
  references, so no Glyph changes appearance.

Implicit collection on save was rejected. It destroys an upload the moment the
user toggles a Glyph back to its label to compare, which is a normal thing to do
while styling.

A row reads **Used** or **Unused** and no more. A count of affected Glyphs would
mean two different things depending on the tier that set the reference: an image
on the Project base is used by every Glyph that does not override it, and
counting those means resolving the whole cascade for every Input on every Device.

### 6. Removal sweeps three layers, and ids stop being reusable

Removing an image drops the manifest row, forgets the runtime registry blob, and
deletes the IndexedDB entry. It also **clears every reference at every tier that
set it** — `background.source` at the Project base, the Device tier or a Glyph
override, and `foreground.renderSource` — via `clearOverrideField`.

Dropping the manifest row is by itself enough to make a Glyph fall back:
`resolveRenderSource` and `withAvailableImages` both check the **manifest**, not
the bytes. Clearing the tier is the honest completion of that, not a second
mechanism — and it is what #81's "Ignore" exit needs, so #62 no longer waits on
#81 and the dependency runs the other way.

Clearing alone is not sufficient, because it is only as good as the walk being
exhaustive, and a missed site fails **silently**. `nextImageId` numbered
`img-<n>` above the highest id **in the manifest** — the one collection removal
shrinks. Remove the highest-numbered image, upload another, and it takes the
freed id; any surviving reference then adopts art the project never contained.
That is the exact failure ADR-0011 exists to prevent: _wrong art is worse than no
art._ Its own doc comment anticipated removal and assumed the id could not be
reused.

So ids are **minted, not counted**: `<slugified-filename>-<tag>.<ext>`, unique by
construction, the way `loadFontFromFile` already mints a family. The stem is the
uploaded filename because that is the name the user recognises, and it stays true
however many Glyphs point at the image — unlike a Device or Input in the id,
which an image cannot honestly carry, since it is project-level and one upload
can serve several Glyphs in different roles. The extension is kept so the ZIP
entry stays a file an OS recognises.

ADR-0010 makes this safe to ship: an existing `img-1.png` id still validates as a
string and still resolves, because nothing parses an id except the allocator.

### 7. The picker is a gallery of what the scope can draw

The artwork `<select>`s become grids of the art itself (#45), which decides three
things about what a grid contains.

**Every variant of the union is a tile, including the ones that are not art.**
`none` and the drawn primitives head the grid, so one control still presents
every choice the `<select>` did. The grid itself knows nothing about Assets:
tiles arrive already drawn, which is what lets them sit in it without the grid
needing a notion of "an option that is not an Asset".

**A drawn primitive is a tile, and there are three of them.** `shape` is one
variant of the union but three things on screen, so it appears as one tile per
`BackgroundShape` rather than a single "Shape" tile beside a radio set naming
which. A gallery exists so the user picks art they can see, and the one choice
that is already a picture would otherwise be the only one still picked blind, in
two gestures. That makes a tile the first control to write two cascade fields —
`backgroundSource` and `shape` — with two consequences the panel carries: its
reset clears both, and `shape` is written only when the pick changes it, so
coming off a tile onto the primitive already in force doesn't pin a value that
was still being inherited. Only `none` is left carrying a word rather than a
picture, having no picture to carry.

**A picker offers only art the scope can actually draw.** `bumper` and `trigger`
are authored by the pads and by nothing else, with no shared drawing behind them,
so a Keyboard Glyph asking for one resolves to no art and the renderer quietly
draws the plain shape. The grid therefore filters to the tiles every Device in
scope can draw — one Device at the Device and Glyph tiers, all of them at Project
scope, since a Project-tier source applies to each. This answers a question #45
left open ("should the gallery filter to the previewed Device's Symbol Set?") and
it is the gallery's own doing: a text `<option>` merely offered a name, while a
tile shows a picture, and a picture of art the Glyph will not draw is a promise
the draw path breaks. §4 keeps the filter and the stored value from drifting
apart; where they drift anyway — a stale save, a Preset naming art some Device
lacks — the grid shows nothing picked rather than naming a tile it is not
showing.

**Each picker ends with a tile that opens the window.** Separating having from
picking costs a trip when the user discovers mid-style that the art they want
isn't in the project yet, and "go to the menu bar" is a poor answer from inside
the grid. The trailing tile is that trip, taken from where the need is noticed.
It does not weaken §1: the tile opens the window and picks nothing, and the
window still assigns nothing on the way back. It rides in the grid as an option
rather than sitting beside it as a button so there is one keyboard model — arrow
past the last upload, press Enter — and its key is intercepted before the
selection changes, so the picker still holds only values.

## What is built now

The window and its **Images** section in full (#62), and the Style panel's
pickers becoming grids of art (#45). **Fonts** uploads but does not remove.
**Symbol Sets** is an empty section, standing as the home #39 fills.

## Deliberately not decided here

**Whether a Glyph may draw a Symbol other than its Catalog's.** A Symbol gallery
only means something if a different Symbol can be picked, and
`RenderSourceOverride`'s `symbol` variant carries no id — the Catalog owns that
mapping. Widening it reaches into cascade resolution, config validation and
Presets. The grid ships showing the one Symbol the Catalog gives an Input; the
free picker stays #45's to carry, and the intended destination is that any Symbol
from any Catalog becomes pickable.

## Consequences

- An uploaded **font** is an Asset with the same one-way manifest and no removal.
  This ADR says where it belongs; building it is a follow-up issue rather than a
  silent omission.
- Removal cannot leave references in places the user cannot see: disabling an
  Input drops its Glyph override, and removing a Device drops the whole
  `DeviceConfig`, so **Used** means visible somewhere.
- A shipped **Preset** adds no reference site — #82's build gate rejects any
  `imageId` anywhere in a Preset export — and the Catalog per-Input tier that
  ADR-0006 had is gone (#78), with seeds able to name only an Authored
  Background. So the reference walk has exactly the sites listed in §6, and that
  is a closed set rather than a best effort.

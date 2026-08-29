# ADR-0015: An imported Symbol Set is config, holds exactly what its file draws, and is viewed rather than styled

- **Status:** Accepted
- **Date:** 2026-08-24
- **Amends:** ADR-0007 §3 (a Set's role colours are a viewing palette, not the
  per-Input default tier that ADR-0012 §2 and #78 removed), ADR-0014 §3 (fills
  the Symbol Sets section it stood up empty)

## Context

Every Symbol the tool can draw is compiled in. `npm run symbols` windows the
cells of four atlas SVGs in this repo into `symbols.generated.ts`, and
`getSymbolSvg(id, device)` reads that module constant. Adding art means adding it
to the repo.

#39 is what lets a user bring their own: one authored SVG, windowed in the
browser, its cells becoming Symbols and Authored Backgrounds the project can
draw with. The prototype on `proto/38-symbol-set-import` settled the mechanics —
`getBBox()` reproduces every shipped viewBox exactly, so none of the jsdom
bounding-box maths in `build-symbols.mjs` is needed client-side — and settled the
reconciliation rules a refresh obeys. It deliberately left three things open, and
they are what this ADR decides: where the art lives, what a Set's role colours
mean, and how imported art reaches a draw path that is a module-level lookup.

## Decision

### 1. A Set's cells are config, not bytes beside it

An imported Set is stored in `Project.sets` with each cell's **windowed SVG
markup carried inline**. There is no IndexedDB entry, no `sets/` folder in the
project ZIP, and no re-windowing when a project loads.

This departs from how an image or a font is stored, and the difference is real
rather than an inconsistency. An image's bytes are opaque, large, and drawn as
they are; a windowed cell is a few hundred characters of text whose sentinels the
renderer **rewrites on every draw**, so it has to be text at the point of use
anyway. Storing the original atlas instead and re-windowing on load would put a
DOM measurement — the one step that cannot be pure — inside the project load
path, to reproduce a result that was already computed once.

The source file is the **author's**, not the project's copy. A refresh re-reads
that path; the project holds what it drew at the time. That is why nothing needs
to travel beside the config: the config _is_ the shipment.

The four shipped atlases are 1–20 KB each, so a Set costs about what its atlas
costs. ADR-0010 makes this cheap to revisit — nothing parses a cell but the
renderer, and a config that doesn't match the current shape is discarded rather
than migrated.

### 2. A Set holds exactly what its file draws

The load-bearing rule, and the reason there is deliberately **no control to
remove a single cell**. A cell the file stops drawing is removed on refresh
whether or not a Glyph is using it, and cells cannot be cherry-picked on the way
in. Both halves serve one end: a Set can never drift from the atlas it came
from, so "what does this Set contain?" always has the same answer as "what does
that file draw?".

What a refresh may **not** do is take art away quietly. Every Glyph left without
art is warned about **by id** — before accepting and after — because the id is
what the author has to put back in the drawing. The Glyph keeps its Symbol id and
draws its label meanwhile, so restoring the drawing restores the Glyph with no
manual repair. Six rules in full, implemented by `buildReview`:

1. Art always comes from the file; the project never edits it.
2. A typed label survives a refresh; an untouched one re-derives from the
   Catalog.
3. Role colours are project config and a refresh never touches them.
4. The Set is exactly what the file draws (above).
5. Art is never removed quietly (above).
6. A name is an identity. A rename is indistinguishable from a delete plus an
   add, so the tool says exactly that rather than pairing ids up by guess and
   carrying a typed label onto art that might be something else.

Removing an Authored Background has no separate mechanism, as ADR-0014 said it
would not: a Background is a Set cell, so removing one means removing or
replacing its Set.

### 3. A Set's role colours are a viewing palette, not a cascade tier

A Set carries default Paint Role colours, and they decide **how its art is
looked at** — in the Assets window and in gallery tiles — and nothing else. They
never enter style resolution, and no Glyph draws differently because of them.

This is a narrowing of what ADR-0007 §3 anticipated, and the narrowing is the
point. That section put a brand palette (Xbox A green, B red) at the
**Catalog-per-Input default** tier. ADR-0012 §2 and #78 removed that tier: a
Catalog now says what is _present_ and seeds _art_, while a shipped **look** is a
Preset. Giving a Set a colour tier would reintroduce, under a new name, exactly
the rank that was deleted — and it would put a second surface in the business of
setting `symbolPaints`, which ADR-0014 §4 exists to prevent ("don't fork the
cascade UI").

The palette still earns its place. Authored art is painted in sentinels, which
are legible as data and illegible as a drawing; the first thing an importer does
is look at their Set, and pure red-on-blue is not looking at it. So it is
configuration of the Set, stored in config and travelling in the ZIP — the
structure-only invariant holding either way, since the SVG carries only ids and
sentinels while the project carries colour.

A brand palette that reaches rendered Glyphs remains available and belongs to
Presets (ADR-0012), which is the mechanism for a shipped look.

### 4. Imported art wins, on every Device, through a registry

`getSymbolSvg` consults the imported cells first and falls back to the shipped
atlases. Imported art is **not Device-scoped**: a shipped id is bare and the
_atlas file_ is what scopes it to a Device, but an imported Set is a
project-level shipment with no Device to belong to. A user who drew a cell called
`a` meant theirs.

The bridge is a module-level registry (`set-art.ts`) that the editor keeps in
step with `project.sets`, not a project argument threaded through the draw path.
The call sites are the compositor, the live preview, the Device Layout and the
exporter; an id that resolves differently depending on which of them asked is a
worse outcome than a registry. **A loaded project owns its Set art outright** —
registration replaces wholesale — which is ADR-0011's rule for images, for
ADR-0011's reason: wrong art is worse than no art.

Registering also clears the whole bitmap cache. A cache key carries an id, not
the art behind it, so art swapped underneath a warm key would draw stale;
evicting precisely would mean walking three namespaces and every warm size to
save a refill that happens on the next draw.

### 5. Imported art is rendered sandboxed, never inlined

Shipped art is inlined with `dangerouslySetInnerHTML` so its sentinels can be
substituted, and that is safe because it is generated from atlases in this repo.
An imported Set is a file the user picked, and a project ZIP carrying one can be
handed to someone else. An SVG can hold a `<script>`.

So an imported cell is drawn as an `<img>` over a data URI, which renders the
same drawing with scripting inert — and is what the draw path has always done
anyway, rasterizing through a Blob. The picker and the review share one component
(`SetCellArt`) so no future call site can pick the inline path by accident.

### 6. A retained file handle is session-lived

Refresh-from-path keeps the File System Access API's `FileSystemFileHandle` in
memory for the sitting. Persisting one means storing it in IndexedDB and
re-requesting permission on the next visit, and the gesture it saves — "I
re-exported, pull it in again" — belongs to the sitting where the drawing was
changed.

Where the API is absent (Firefox, Safari), importing is an ordinary file input
and refreshing asks for the file again. The reconciliation is identical either
way, since a re-pick may legitimately land on a different path and the Set keeps
its own id and name regardless.

### 7. Any Glyph may draw any Symbol; importing never creates Inputs

`RenderSourceOverride`'s `symbol` variant gains an optional `symbolId`. Omitted
still means "whatever Symbol the Catalog gives this Input", so a Glyph goes on
tracking its Catalog and a Catalog fix reaches it; an id **pins** one Symbol,
shipped or imported. This answers the question ADR-0014 left open, and importing
is what forced it: without pinning, an imported cell only ever draws if its id
happens to collide with a shipped Catalog entry's `symbolId`, so a Set of new
drawings imports, lists, previews, recolours, refreshes — and can never appear on
a Glyph. Half the feature would have been decoration.

A pinned id is taken at its word and never checked against the Catalog. Whether
it resolves to art is the draw path's question, and degrading to something else
would make a Glyph quietly draw art the user did not choose — the failure
ADR-0011 exists to prevent. An id nothing draws renders as nothing.

**Accepting an import still creates no Inputs.** A Set is a shipment of art; an
Input is a Device's sprite in a Device's atlas. What lands in an export stays the
user's call — the mirror of ADR-0014 §5's "removal is always explicit". The
Assets window instead offers **Add as Input** per cell, which mints a custom
Input on the **active Device** already pointed at that Symbol. The active Device
rather than all of them because an Input belongs to exactly one and yields
exactly one sprite; pressing again from another Device is cheap, while pruning an
unwanted paddle off three Devices is not.

## Consequences

- **A Set is not an Asset**, per ADR-0014 — it is the shipment that carries them
  — so it has no manifest row beside images and fonts. `Project.sets` holds the
  shipments; the Assets window's other two sections hold Assets.
- **A cell id can collide with shipped art**, and imported art wins. That is
  intended (§4) but it is a real way to change what a Device draws without
  touching a style, so the Assets window shows every cell of every Set rather
  than only the unrecognised ones.
- **The Render Source picker now runs to dozens of tiles** rather than three,
  since every Symbol the Device can draw is on offer (§7). It is capped and
  scrolled. A Symbol only some Devices author is filtered out at a tier covering
  several, exactly as `authoredBackgroundsFor` already does for tiles: a bare id
  is scoped by the atlas it lives in, so offering one the draw path will not
  deliver is the silent degrade #45 named.
- **A pin outlives the Set that drew it.** Removing a Set leaves Glyphs pinned to
  its ids drawing nothing, and the picker shows nothing selected rather than
  lighting the wrong tile. This is deliberate: the refresh warning (rule 5)
  already names art in use that stops being provided, and silently repointing a
  Glyph is the one thing worse than a Glyph that draws nothing.
- **The measurement port is only exercised in a browser.** `measureAtlas` needs
  layout, which jsdom does not have, so it has no unit tests; the pure half
  (windowing, binding, reconciliation) carries the coverage and the port stays
  thin enough to read.

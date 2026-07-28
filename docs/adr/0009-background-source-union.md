# ADR-0009: A Background's tile art is one `source` union

- **Status:** Accepted
- **Date:** 2026-07-27
- **Amends:** ADR-0006 (the Style Cascade's Background property)

## Context

A Glyph's **Background** started as a drawn primitive: a shape plus a fill and a
border. ADR-0006 put every one of those properties in the Style Cascade. Issue
#18 then added **Authored Backgrounds** — shipped SVG tiles, so a bumper can be
bumper-shaped — as an optional `backgroundId` beside the shape, with a `flipX`
flag to mirror the left-side ones. Inside a sparse override the id could also be
`null`, meaning "no tile, draw the plain shape", because the Catalog per-Input
tier outranks the Device tier and omitting the field would just let a bumper's
tile fall through again.

Issue #22 adds a third kind of tile: an **uploaded image**, the user's own tile
graphic. Bolting a second optional id onto the Background would leave three
fields describing one thing, with an unwritten rule about which wins when two are
set, and a `flipX` that is meaningful for exactly one of them. That is a state
space the drawing code would have to keep re-deciding — and each draw path
(preview, compositor, single-Glyph preview) would decide it separately.

## Decision

A Background names its tile art with **one** discriminated union:

```ts
type BackgroundSource =
  | { kind: "shape" } // the drawn primitive
  | { kind: "authored"; backgroundId: string; flipX?: boolean }
  | { kind: "image"; imageId: string }; // an uploaded tile
```

- It is an ordinary Style Cascade property, settable at **any scope** — Project,
  Device, Catalog per-Input, or Glyph — and it **replaces wholesale**, never
  merges: a source is one choice, so patching an `image` onto an `authored` base
  can't leave a tile that is half of each. `flipX` rides inside the authored
  variant, so it cannot outlive the tile it describes.
- `{ kind: "shape" }` is the explicit "no tile" the `null` id used to spell. The
  distinction that mattered survives: _omitting_ the field falls up the cascade,
  _setting_ it to `shape` overrides an inherited tile.
- An **uploaded tile** references an `ImageAsset` id — the same manifest,
  registry, IndexedDB store and ZIP bundling that custom image Render Sources use
  (ADR-0008). One upload can serve as one Glyph's artwork and another's tile.
- The two kinds of art keep the treatment their authorship earns. An Authored
  Background is tool-owned square art: it fills the cell exactly and is recoloured
  through the Background's `fill` / `border.color` sentinels. An uploaded image is
  the user's own graphic of unknown aspect: it is **fitted** to the cell, never
  stretched, and **never recoloured** — so the fill and border controls disappear
  while one is selected, rather than sitting there doing nothing.
- Art that can't be honoured — an unknown id, an image whose bytes aren't present
  — falls back to the plain shape rather than failing, matching how a missing
  Render Source degrades.

## Consequences

- Resolving a source to its bitmap happens in exactly one module
  (`background-render.ts`), which the preview and the exporter's compositor
  share, so what is previewed is what is exported. Other code still switches on
  `source.kind` for its own reasons — cache keys, config validation, which
  controls the Style tab shows — but none of them decides which art is drawn.
- The persisted config schema moves to **v5**: a saved `backgroundId` + `flipX`
  pair is rewritten into the union at every tier it can appear — the Project base,
  a Device override, a per-Glyph override — including the `null` spelling of "no
  tile".
- Uploaded tiles inherit the custom image lifecycle wholesale, including its
  current limitation: an image no Glyph references still occupies storage and
  still ships in the ZIP.

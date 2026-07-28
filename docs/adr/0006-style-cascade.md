# ADR-0006: Glyph style resolves through a Project → Device → Glyph cascade

- **Status:** Accepted (extended by ADR-0007, ADR-0008 and ADR-0009)
- **Date:** 2026-07-17
- **Amended by:** ADR-0007 — adds a `symbolPaints { fill, border, secondary }`
  group (Symbol paint roles) to the cascade. ADR-0008 — adds `contentScale`, and
  resolves a Glyph's Render Source through the same tiers. ADR-0009 — replaces
  the Background's tile fields with one `source` union, cascaded like any other
  property but replaced wholesale.

## Context

Style was a flat, project-wide set (`textColor`, `background`, `cellSize`) applied
identically to every Glyph. The redesign wants two new capabilities: per-Device
styling (a controller with circle backers, a keyboard with rounded-rect keycaps)
and per-Glyph editing (select one Glyph, tweak its properties). A single global
style can't express either.

## Decision

Visual style resolves through a four-level cascade, lowest precedence to highest,
each level a sparse override of the ones below:

```
Project defaults  →  Device overrides  →  Catalog per-Input default  →  Glyph overrides
```

Any Background property (source, shape, corner radius, fill, border width + color)
and the text color may be set at **any** level; unset properties fall up the chain.

The **Catalog per-Input default** tier carries shipped, input-specific defaults —
a bumper's authored Background, a well-known key's Symbol Render Source. It sits
_above_ Device overrides so input-specific identity survives a device-wide change
(setting "Xbox = circle" reshapes face buttons but leaves bumpers on their authored
backers), and _below_ explicit Glyph edits so the user always has the final say.

`cellSize` and the **font** are deliberately **not** cascadable — they stay
Project-global. cellSize keeps the atlas grid uniform; a single font keeps the
tool's "match your game's identity from one font" promise (ADR-0002).

### Amendment: clearing an inherited Background source (issue #18)

"Unset properties fall up the chain" gives a tier two states — set, or absent —
which is enough for every property whose default is a plain value. It is not
enough for the Background **source**, because the Catalog per-Input tier sits
_above_ Device: a bumper's authored Background is inherited from a higher tier
than most edits, so leaving the field unset re-inherits the tile instead of
removing it. Without a third state there is no value a Glyph can write that means
"no tile" — a per-Glyph shape change would resolve to the tile anyway and appear
to do nothing.

So `BackgroundOverride.backgroundId` is **tri-state**: absent (fall up), an id
(use that tile), or `null` (explicitly no tile — draw the plain shape). `null`
clears the mirror flag with it, since `flipX` is meaningless without a tile. Only
the source needs this; every other property keeps the two-state rule.

## Consequences

- The model stores overrides as partial style objects at Device and Glyph level,
  not full copies; the renderer resolves effective style per Glyph before drawing.
- Live preview and the atlas compositor must both resolve through the same cascade
  so preview matches output.
- cellSize could in principle vary per Device (each Device is its own atlas) — this
  is intentionally deferred, not forbidden, to keep the first cut simple.

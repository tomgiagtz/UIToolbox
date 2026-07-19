# ADR-0006: Glyph style resolves through a Project → Device → Glyph cascade

- **Status:** Accepted
- **Date:** 2026-07-17

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
*above* Device overrides so input-specific identity survives a device-wide change
(setting "Xbox = circle" reshapes face buttons but leaves bumpers on their authored
backers), and *below* explicit Glyph edits so the user always has the final say.

`cellSize` and the **font** are deliberately **not** cascadable — they stay
Project-global. cellSize keeps the atlas grid uniform; a single font keeps the
tool's "match your game's identity from one font" promise (ADR-0002).

## Consequences

- The model stores overrides as partial style objects at Device and Glyph level,
  not full copies; the renderer resolves effective style per Glyph before drawing.
- Live preview and the atlas compositor must both resolve through the same cascade
  so preview matches output.
- cellSize could in principle vary per Device (each Device is its own atlas) — this
  is intentionally deferred, not forbidden, to keep the first cut simple.

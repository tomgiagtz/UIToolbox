# ADR-0003: TexturePacker-format JSON as the single metadata format

- **Status:** Accepted
- **Date:** 2026-07-16
- **Context ticket:** #1 (Spec: Input Glyph Creator)

## Context

Each generated **Sprite Atlas** (PNG) needs an accompanying metadata file so a
game engine can find each **Glyph** by **Sprite Name** and know its rect within
the atlas. There are many options: a bespoke JSON shape, engine-specific formats
(Unity `.meta` sprite sheets, Godot atlas resources), or an established
interchange format.

Constraints from the spec:

- Output must be consumable by off-the-shelf importers, **including Unity's**
  (user story 20), without extra work.
- We want **one** format now, not a fan-out of per-engine exporters (those are
  explicitly out of scope — the `Exporter` seam makes them drop-in later).

## Decision

Emit a **TexturePacker-format JSON** document per Device, alongside the atlas
PNG. TexturePacker's JSON (hash/array `frames` with `frame`/`spriteSourceSize`/
`sourceSize`/`rotated`/`trimmed` and a `meta` block) is:

- **engine-agnostic** — a widely understood interchange format, and
- **Unity-importable** — Unity (and many other importers) read it directly.

So a single format covers both the generic-metadata need now and Unity later,
without a second exporter.

## Consequences

- One `Exporter` implementation, one format to test. The pure `generateTilesets`
  seam returns the TexturePacker metadata document as plain data; tests assert
  frames match placements and Sprite Names.
- **Out of scope (drop-in later behind the `Exporter` seam):** dedicated
  Unity/Godot/Unreal exporters and a raw-zip export.
- We take on matching TexturePacker's schema precisely enough that real importers
  accept it — verified via the Playwright e2e download assertions in later
  tickets.
- Sprite Names in the metadata are the `slugify` + template + case output, so the
  metadata is only as correct as the naming pipeline (kept behind the same seam).

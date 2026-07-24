# ADR-0004: Symbols and custom images as Glyph Render Sources

- **Status:** Accepted (colour model amended by ADR-0007)
- **Date:** 2026-07-17
- **Amends:** ADR-0002 (font-rendered glyphs)
- **Amended by:** ADR-0007 — the tintable / fixed-colour / `tint` model below is
  superseded by sentinel paint roles and importable Symbol Sets.

## Context

ADR-0002 made every Glyph a font-rendered label and explicitly ruled out device
artwork, to avoid a curated library that wouldn't match the user's font and to
sidestep trademark risk. In practice, symbol-represented controls — Triangle,
D-pad arrows, Shift, Enter, Space — read poorly as text labels, and users want
authentic gamepad artwork. ADR-0002 anticipated this and deferred it to "a new
decision that supersedes this one."

## Decision

An Input's Glyph content is chosen from one of three **Render Sources**, all
composited onto the same Background tile (so tiles, borders, and sizing stay
uniform):

1. **Label** — font-rendered string. Default for arbitrary Inputs.
2. **Symbol** — a bundled **SVG** the tool ships, keyed by stable `id`. Default
   for well-known Inputs. Each Symbol is either **tintable** (single-color,
   authored with `currentColor`, follows the label text color) or **fixed-color**
   (brand art such as PlayStation shapes / Xbox face buttons, ignoring text
   color). The `tint` flag lives in a shipped Symbol manifest.
3. **Custom image** — a user-uploaded image/SVG, drawn on the tile like a Symbol.

The **label remains mandatory** on every Input regardless of Render Source: it is
the Input's identity and the source of its Sprite Name (`slugify` still applies).
Well-known Inputs seeded by a Preset carry a Symbol reference and default to it;
the user can toggle any Input back to its label.

## Consequences

- The renderer gains an SVG-on-tile path alongside the label path; both fit the
  same tile content box, shared by live preview and atlas compositor.
- We ship ~38 authored SVG Symbols (keyboard/mouse, Xbox, PlayStation, shared
  d-pad/stick) plus a manifest (`id`, default `label`, `tint`).
- **Trademark/licensing risk that ADR-0002 avoided is now accepted deliberately:**
  fixed-color PlayStation shapes and Xbox face buttons resemble platform-holder
  marks. These assets are author-supplied and shipped at the project owner's
  discretion; this is a known, owned risk, not an oversight.
- Custom images are user-supplied assets. They are **not** kept in an IndexedDB
  blob store; instead they round-trip inside the ZIP **project save file**
  (alongside `config.json` and the font), so the user always gets their full
  configured data back on Load. A bare page refresh restores only the config +
  the bundled default font; the config references images by name and falls back
  gracefully (to the label / Symbol) when an image's bytes aren't present.

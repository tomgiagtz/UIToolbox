# Authored controller Device Layouts

The pad (controller) **Device Layouts** are drawn from authored SVGs kept here.
Each controller's SVG is the single source of truth; a codegen step parses it into
`pad-layouts.generated.ts`, which the app and tests import. This stays within
ADR-0005 — the Device Layout is editor chrome only and never enters an exported
Sprite Atlas.

## The workshop loop

1. Author/adjust the controller in your design tool (outline, backer shapes, and
   one shape per button/bumper/trigger/stick).
2. Export an SVG named for the Catalog id: `xbox.svg`, `playstation.svg`.
3. Drop it in this folder.
4. Map its shapes in `mapping.mjs` (see below).
5. Run `npm run layouts` to regenerate `pad-layouts.generated.ts`.
6. Refresh the Glyph Creator — the authored Layout replaces the code-drawn
   fallback for that pad. Repeat from step 1 to iterate.

## Export convention

- **Name your layers.** A shape's design-tool name must survive export as the SVG
  `id` (most tools do this) or a `data-name` attribute. The codegen reads `id`
  first, then `data-name`.
- **Names need not match Catalog ids.** The `mapping.mjs` table translates each
  interactive shape's design name to its Catalog id (e.g. `"A Button" → "xbox-a"`).
- **Interactive vs. decoration is decided by the map.** Any shape whose name is a
  key in the controller's mapping becomes a clickable, toggleable button; every
  other drawable (the outline, backers, labels) is decoration — drawn verbatim and
  non-interactive, behind the buttons, preserving its authored fill/stroke.
- **`viewBox` required.** Keep a `viewBox` on the root `<svg>`; the Layout scales
  to fit the panel.
- Button shapes have their authored `fill`/`stroke` stripped so the enabled
  (highlighted) / disabled (dimmed) theme can style them; decoration keeps its
  authored styling.

## Files

- `*.svg` — authored controller sources (git-tracked).
- `mapping.mjs` — design-name → Catalog-id map, per controller. Edit this.
- `build-layouts.mjs` — the codegen (`npm run layouts`). Uses `jsdom` to parse.
- `pad-layouts.generated.ts` — generated output. **Do not edit by hand.**

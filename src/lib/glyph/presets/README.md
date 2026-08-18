# Shipped Presets

A **Preset** is a look you can apply: a **Device Preset** styles one Device, a
**Project Preset** also writes the Project tier of the Style Cascade. Neither
carries a selection, a project name, or any bytes (ADR-0012 §3).

Shipped Presets are **code**. Each one is a committed tool export in `sources/`,
projected by `npm run presets` into the narrow style-only shape in
`presets.generated.ts`, which `tsc` checks from then on and CI regenerates. The
app imports `../presets.ts`, never a source file or this codegen — nothing here
is parsed at runtime, so a broken Preset stops the build rather than surfacing
as a status line a user can do nothing about (ADR-0012 §5).

## The workshop loop

1. **Style it in the tool.** Open the Glyph Creator and build the look.
2. **Export the project** (Save) and drop the JSON into `sources/`.
3. **Add its row to `manifest.mjs`** — `id`, `label`, `kind`, `source`, and for
   a Device Preset the `catalogId` to lift out. Array order is picker order.
4. **Run `npm run presets`** and commit `presets.generated.ts` with the source.

The generated file is derived, never hand-edited: fix a Preset by re-exporting
its source, not by patching the output.

## Where to do the styling

A **Device Preset** keeps the Device and Glyph tiers of the one Device its
manifest row names — its export's Project tier is dropped, because applying it
must not repaint a project it was only ever meant to style one Device of. So
author it at the **Device tier** (and per-Glyph), leaving the project style
alone; anything set at the project tier is silently not shipped.

A **Project Preset** keeps the Project tier plus every Device in the export. Its
device list is a **presence** fact: a Device you already have is restyled, and
one you lack is created from its Catalog's **Default Selection**, which is why
the projection drops `enabled` and `custom` outright.

## The gate

`build-presets.mts` is the single place a shipped Preset is validated. It throws
the build on:

- any `imageId` anywhere, and on `name` / `cellSize` / `naming` /
  `filenameTemplate` / `images` / `enabled` / `custom` surviving the projection;
- an unknown `catalogId`, or a `glyphStyles` key that isn't an Input of that
  Catalog (a **custom** Input's id included — customs don't ship);
- a `backgroundId` that isn't a shipped Authored Background;
- a font family that isn't in `BUNDLED_FONTS` — a Preset may name only bundled
  families, never font bytes.

It also canonicalises every rotation into −180…180 as it writes, so a shipped
Preset reads the way the tool's own control would have spelled it.

Structural drift — a field that changes shape inside `GlyphStyle`,
`StyleOverride`, or the `BackgroundSource` union — is not the gate's job: the
projection copies style verbatim, so `tsc` catches it over the generated
literal, and CI's regenerate-and-diff step catches a source that stops
projecting to what is committed.

## Why `.mts`, and what it may import

The gate runs on Node's native type stripping with no new dependency, so it can
only import modules that need no `@/` alias resolution: `catalog.ts` and
`bundled-fonts.ts` import nothing at all, `style.ts` imports only types (which
stripping erases), and the shipped Authored Background ids come from
`../symbols/manifest.mjs` rather than `symbols.ts`, which value-imports its own
generated output through the alias.

# ADR-0008: Custom images persist in IndexedDB

- **Status:** Accepted
- **Date:** 2026-07-27
- **Amends:** ADR-0004 (custom image storage), ADR-0006 (adds a Style Cascade
  property)

## Context

ADR-0004 introduced the **custom image** Render Source and decided its bytes
would **not** be kept in IndexedDB: they would round-trip only inside the ZIP
project save file, and a bare page refresh would restore the config alone,
falling back to the Symbol or label wherever an image's bytes were missing.

Wiring that up (issue #20) made the cost obvious. The uploaded **font** already
persists in IndexedDB, so a refresh keeps the font but silently drops every
uploaded image — two user-supplied assets, uploaded through comparable controls,
behaving differently for reasons that are invisible from the UI. The failure is
quiet, too: the Glyph doesn't error, it just goes back to rendering its label,
which reads as the tool having forgotten the setting rather than the asset.

The original reasoning was about **portability**, not storage: the point was that
a project must travel with its images so a save is reproducible on another
machine. Persisting locally doesn't weaken that; the ZIP still carries the bytes.

## Decision

Custom image bytes are persisted **client-side in IndexedDB**, alongside the
uploaded font — the `images` object store in the same `uitoolbox` database (bumped
to v2). They are restored on load into the runtime registry (`images.ts`) before
the config that references them, so a restored Glyph's first draw already has its
art.

The rest of ADR-0004's model stands:

- The **config carries only a manifest** (`Project.images`: id, filename, MIME
  type); a Glyph's Render Source references an image by **id**, never by bytes.
- The **ZIP project file remains the portable format**, bundling image bytes under
  `images/<id>` next to `config.json` and the font. A project with images always
  saves as a ZIP, even with no font to bundle.
- A referenced image whose bytes aren't present still **falls back gracefully** to
  the Glyph's Symbol or label. Persistence makes that path rarer; it does not
  remove it (a config JSON shared without its ZIP still hits it).

Related: the same issue adds **`contentScale`** to the Style Cascade — a scale for
whichever Render Source a Glyph draws (label, Symbol, or image), resolved through
the ordinary Project → Device → Catalog → Glyph tiers rather than living on the
image itself, so switching sources never discards the sizing.

## Consequences

- Uploaded images survive a refresh, matching the font's behaviour.
- IndexedDB now holds unbounded user data: one entry per uploaded image, for the
  life of the project. "Discard all changes" clears the store along with the font
  and config; there is no per-image delete yet, so an image that no Glyph
  references still occupies storage and still ships in the ZIP.
- The persisted config schema moves to **v4** (adding `contentScale` and `images`);
  v1–v3 saves migrate forward by backfilling an unscaled default and an empty
  manifest.
- Nothing here changes the client-side-only guarantee: no image is uploaded
  anywhere, and the store is per-origin browser storage.

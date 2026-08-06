# ADR-0011: A loaded project owns its image set; the registry is the save's source

- **Status:** Accepted
- **Date:** 2026-07-30
- **Amends:** ADR-0008 (custom image persistence) — it settled _where_ image bytes
  live; this settles _who owns the set_ when projects change, and _which layer_ a
  save reads from.

## Context

ADR-0008 put custom image bytes in IndexedDB alongside the font, restored into the
runtime registry (`images.ts`) before the config that references them. Bytes
therefore live in three places at once: the registry (what the draw path reads),
IndexedDB (what survives a reload), and the ZIP (what travels). ADR-0008 said what
each is _for_, but not how they stay in agreement — and issue #23 found two ways
they don't.

**Image ids are allocated per project.** `nextImageId` numbers above the highest id
the current manifest uses, so every project starts at `img-1`. Two unrelated
projects routinely use the same id for different art. Loading a project registered
the incoming bytes but never dropped the outgoing ones, so the layers merged: a
config shared without its assets — a bare `config.json`, the format ADR-0010 made
the norm — drew the _previous_ project's art under the id it referenced. The
fallback ADR-0008 promised ("a referenced image whose bytes aren't present still
falls back gracefully") never fired, because from the registry's point of view the
bytes _were_ present. Wrong art is worse than no art: no error, no warning, just a
Glyph confidently showing something the project never contained.

**A save read the wrong layer.** Bundling read IndexedDB alone. But `saveImage`
swallows a failed write by design (private mode, quota, disabled storage — ADR-0008
accepted that images "just won't survive a reload"), and the registry doesn't care
whether that write landed. So an image could upload, draw on its tile, export into
an atlas, and still be absent from its own project ZIP — leaving a config
referencing bytes that never shipped. The save was quietly worse than the screen.

## Decision

**Loading a project replaces the image set in every layer.** The registry is
cleared and IndexedDB is replaced wholesale (`replaceImages`) with exactly the
images the incoming file carried, before the config that references them is
dispatched. A load is a replacement, never a merge. A file arriving without its
bytes therefore falls back to the Symbol or label, as ADR-0008 intended.

**A save sources bytes from the registry, backfilled from IndexedDB.** What draws,
ships: the registry is the layer the compositor and preview read, so an image the
user can see is one the ZIP carries, whether or not its write to IndexedDB landed.

**A save that can't find some bytes says so.** The ZIP is still produced — every
Glyph that has art keeps it and the rest fall back — but the user is told which
images are missing. It is the only copy that travels, so an incomplete one must not
leave silently.

## Consequences

- Cross-project id collisions are no longer expressible: the registry only ever
  holds the current project's images.
- The three layers now have a stated precedence — registry over IndexedDB for
  reads, whole-set replacement on load — rather than each being written to
  ad hoc at each call site.
- Loading a project drops the previous project's persisted images. That is the
  point, but it means IndexedDB is scratch space for the open project, not an
  archive: the ZIP remains the only durable copy, exactly as ADR-0008 has it.
- Unreferenced-image accumulation _within_ one project is unchanged — there is
  still no per-image delete (ADR-0008's open consequence). A load now collects
  that garbage as a side effect, which is not a substitute for the feature.
- The failure ADR-0008 called "rarer, not removed" is now reachable again by
  design, so it stays tested: a config-only load must fall back, not redraw.

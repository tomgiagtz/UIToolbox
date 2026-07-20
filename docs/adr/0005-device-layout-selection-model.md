# ADR-0005: Device is a Catalog + enabled selection, picked via a code-drawn Layout

- **Status:** Accepted
- **Date:** 2026-07-17

## Context

Originally a Device was just an editable list of label strings, and every Input
in the list was generated. The redesign wants a clickable device diagram where
the user turns Inputs on and off — which implies each Device has a _known set_ of
possible Inputs, not an open-ended list. We also considered author-supplied
device artwork (silhouettes / photoreal diagrams with hotspots) but rejected it:
the only assets the project owner wants to author are the Symbols.

## Decision

A Device owns a fixed **Catalog** of known Inputs (every keyboard key, every pad
button). The user **enables** a subset; only enabled Inputs generate Glyphs.
Inputs not in the Catalog are added as free-text **custom Inputs**. A **Preset**
is the default-enabled subset (Keyboard ≈ 24 gaming keys; pads ≈ full Catalog).

The Catalog is presented through a **code-drawn Device Layout** used purely for
selection:

- **Keyboard** — standard US QWERTY, correct staggered rows, each key a
  rounded-rect keycap with its standard legend.
- **Xbox / PlayStation** — clustered **Symbol nodes** (d-pad, face-button
  diamond, bumpers/triggers, view/menu), each node showing that button's Symbol.

The Layout is **editor chrome only**: it never appears in an exported Sprite
Atlas, and no layout art is authored — the pads reuse the already-authored
Symbols; the keyboard is drawn from key metadata. The _styled_ output preview
(Background, chosen Render Source) lives in the right-hand preview, not on the
Layout.

## Consequences

- Catalog + Layout geometry are code-maintained data, not assets; adding a device
  means adding catalog/position data, not drawing art.
- The project model gains per-Device enabled state and a custom-Inputs list,
  separate from the Catalog.
- Authoring real controller **outlines** is deferred to a separate future
  prototype; it does not block this model. If adopted, an outline would layer
  behind the Symbol nodes without changing the selection semantics.
- The keyboard's full catalog is large; most keys render disabled by default.

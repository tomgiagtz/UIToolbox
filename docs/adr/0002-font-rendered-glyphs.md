# ADR-0002: Glyphs are font-rendered, not device artwork

- **Status:** Accepted
- **Date:** 2026-07-16
- **Context ticket:** #1 (Spec: Input Glyph Creator)

## Context

Input prompts in games ("Press **A** to jump") are often shown with authentic,
per-device button artwork — the Xbox "A" button, the PlayStation cross, etc.
An obvious design would be to ship a library of device button images and let the
user pick.

But the tool's purpose is to let a developer match **their game's** visual
identity from **their own font**, consistently, across an arbitrary set of
controls — and to regenerate the whole batch when the font or color changes. A
curated artwork library would:

- constrain output to whatever symbols we drew,
- not match the user's font/style,
- carry licensing/trademark risk for real platform button art, and
- make "add a control I care about" impossible without new artwork.

## Decision

A **Glyph** is a **label drawn in the user's chosen font** on a generated
**Background** tile (shape + fill + border). There are **no per-device image
assets**.

An **Input Device** is therefore a _grouping_ of **Inputs** (label strings), not
a render variant. "Keyboard" vs "Xbox pad" changes _which labels_ are in the
list, not _how_ a Glyph is drawn.

## Consequences

- The renderer is device-agnostic: one canvas Glyph renderer (Background + a
  centered, single-line, auto-shrunk label) serves every Device, shared by the
  live preview and the atlas compositor for pixel consistency.
- Users can add any control by typing a label — no artwork pipeline.
- No trademark/licensing exposure from shipping platform button art.
- **Explicitly out of scope:** authentic device button symbols / artwork. If a
  future need for real glyph artwork appears, it is a new decision that
  supersedes this one — it is not a gap to quietly fill.
- Downstream naming still needs per-label normalization (`slugify`) because
  labels like `Right Stick` or `→` must become safe Sprite Names.

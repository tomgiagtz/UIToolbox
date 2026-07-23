# Full arc taught: string↔Color seam, contained to one file

Across one session (2026-07-20/21) Tom went through all four planned lessons plus
a reference card. He drove the pace ("lesson 2", "lesson 3", "give me the
lesson"), so lessons were delivered on demand rather than gated on demonstrated
mastery — treat mastery as **taught, not yet proven**. No quiz results or written
code seen back yet.

## What was covered
1. **State** (`0001`) — the `Color` object vs. his hex `string`; `parseColor` /
   `toString` as the boundary adapter.
2. **Subcomponents** (`0002`) — `ColorPicker` as a compound component sharing one
   color via `ColorPickerStateContext`; `channel`/`colorSpace`/`getColorChannels`.
3. **Styling** (`0003`) — `react-aria-components` are unstyled; state reaches CSS
   via `data-*` attributes (Tailwind v4 `data-[focused]:`, no plugin installed) or
   `className` as a function; reuse his `cn` + `inputClass` tokens.
4. **Ship** (`0004`) — rebuild `ColorField` internally on React Aria while keeping
   its **exact string props**, so `style-controls.tsx` (3 call sites) and the
   reducer/tests are untouched. Guards: `safeParse` (parseColor throws), casing
   round-trip, non-null Color inside a ColorPicker.

Plus reference card `context-boundaries.html` (his own question about deep/nested
context and where to split boundaries: canonical-vs-working-copy, controlled =
where the boundary sits, re-render cost, two-owner trap).

## The insight to build on
He asks architecture-level questions (the deep-context one), not just API
questions — his ZPD is at "how do I integrate this cleanly," above "how does this
API work." The load-bearing lesson he should be able to reproduce: **contain the
seam inside the component; keep the external API stable; blast radius = one file.**
That's the transferable play for the *next* library (Radix, TanStack), which is
the real mission — React Aria was only the vehicle.

## Open threads / next session
- He has **not yet written or run** the swap. Best next step is a live build or a
  line-by-line review of his version — verify against `npm run test` (reducer) and
  `npm run dev` (glyph-creator preview). Confirm the mastery the lessons assumed.
- Possible extensions he flagged interest-adjacent: click-to-open visual picker
  popover (`ColorArea`+`ColorSlider`); promoting `ColorField` into
  `components/ui/` as a `cva` variant like `button.tsx`.
- If he wants to prove transfer, re-run the five-question method on a *different*
  library with no hand-holding — the true test of the mission.

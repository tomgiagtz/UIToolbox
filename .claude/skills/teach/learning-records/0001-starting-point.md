# Starting point: fluent in React, new to React Aria's value model

Tom pivoted this workspace from CI to a new mission (2026-07-20): adopting
third-party React components with confidence, using React Aria's ColorPicker /
ColorField as the vehicle, with the concrete goal of replacing the hand-rolled
`ColorField` in `glyph-creator/controls-ui.tsx`.

## What he brings
- Strong React/TS. Controlled components are second nature — the field being
  replaced is his own (`<input type="color">`, `value: string`).
- New to React Aria specifically, and (likely) to naming the compound-component /
  render-prop patterns it uses, though he'll recognise Context once pointed at it.

## The key terrain
- The load-bearing insight is the **state shape shift**: his app speaks hex
  **strings**; React Aria speaks immutable **`Color` objects**. Surrounding
  glyph-creator state (`project.textColor`, dispatched `{ color }`) is string-based
  and should *stay* string-based — so the real skill is placing a **boundary
  adapter** (`parseColor` in, `toString('hex')` out), not rewriting app state.
- Subcomponents (`ColorField`/`Slider`/`Area` sharing one `ColorPicker`'s color
  via Context) and styling `react-aria-components` are the next two layers, but
  they only make sense *after* the Color-object model lands.

## Implications for sessions
- Don't teach controlled-component basics. Start at the string→object reframe.
- Frame the whole mission as a reusable **reading method** for any library, so it
  transfers beyond React Aria.
- No copy-paste: teach the model, then have him predict/write code.

Lesson 1 (`0001-the-color-object.html`) covers the `Color` object as single
source of truth and the string↔object boundary. No mastery demonstrated yet —
reassess after the retrieval quiz or when he brings the swap back to discuss.

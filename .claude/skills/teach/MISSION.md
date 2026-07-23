# Mission: Adopting third-party React components with confidence

## Why
Tom builds UIToolbox and keeps hitting the same wall: a well-regarded library
(React Aria, Radix, etc.) has exactly the component he needs, but reaching for it
feels risky. Copy-pasting the docs example works until it doesn't, and then he's
debugging code he never understood. He wants to read a third-party component's
docs, build a mental model of how it manages **state**, how it's **styled**, and
how its **subcomponents** fit together — and then wire it into his own app
deliberately, not by cargo-cult.

The concrete vehicle: replace the hand-rolled `ColorField` in
`src/app/tools/glyph-creator/controls-ui.tsx` (a native `<input type="color">`
that speaks hex **strings**) with React Aria's `ColorPicker` / `ColorField`
family (which speak `Color` **objects**), without breaking the surrounding
glyph-creator state, which stores colors as plain strings.

## Success looks like
- Can read a React Aria component page and say, in his own words, what state the
  component owns, what shape that state has, and how `value`/`onChange` flow.
- Can explain why React Aria uses a `Color` object instead of a hex string, and
  name what that buys him.
- Can place an adapter at the boundary so a string-based app and an
  object-based component coexist (`parseColor` in, `toString('hex')` out).
- Can compose the subcomponents (`ColorPicker` + `ColorField` + friends) and
  explain how the parent shares state with its children without prop-drilling.
- Can restyle a React Aria component to match the UIToolbox Tailwind look.
- Ships the real replacement in `controls-ui.tsx` and its usages in
  `style-controls.tsx`, and can defend each line.

## Constraints
- Fluent in React and TypeScript; writes controlled components daily (the
  existing `ColorField` is his). No need to teach `value`/`onChange` basics.
- New to React Aria specifically and to the compound-component + render-prop
  patterns it leans on.
- Prefers learning grounded in his live UIToolbox code over toy examples.
- Short lessons — one tangible win each.

## Out of scope (for now)
- Accessibility internals of React Aria (ARIA wiring, focus management) beyond
  "this is a reason the library exists."
- Other libraries (Radix, MUI). The transferable *method* is the point; the
  vehicle is React Aria's ColorPicker.
- Building a color picker from scratch.

## Arc (provisional — reassess each session)
1. **State** — the `Color` object as single source of truth; the string↔Color
   boundary. _(lesson 1)_
2. **Subcomponents** — `ColorPicker` as a context provider; how `ColorField`,
   `ColorSlider`, `ColorArea` read shared state; channels & color spaces.
3. **Styling** — styling `react-aria-components` with data-attributes, render
   props, and Tailwind to match UIToolbox.
4. **Ship it** — the real swap in `controls-ui.tsx`, adapters and all.

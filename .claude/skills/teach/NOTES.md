# Working notes

## About Tom
- Fluent React/TS. Writes controlled components daily — the `ColorField` being
  replaced is his own. Don't teach `value`/`onChange` basics.
- Explicitly does **not** want copy-paste. He wants the *mental model* first, then
  to write the code himself. Lessons should build understanding, then have him
  produce/predict code — never hand him a finished component to paste.
- Learns best grounded in his live UIToolbox repo, not toy examples.

## Teaching approach for this mission
- The transferable skill is a *reading method* for any third-party component:
  "what state does it own → what shape → how does value/onChange flow → how do
  subcomponents share it → how is it styled." React Aria's ColorPicker is just
  the vehicle. Name the method explicitly so it transfers.
- Lead with the single biggest reframe (string → `Color` object) before anything
  about styling or subcomponents. Everything else hangs off the state model.

## Repo facts to reuse
- Existing field: `src/app/tools/glyph-creator/controls-ui.tsx` — `ColorField`,
  a native `<input type="color">`, `value: string` / `onChange(string)`.
- Used in `src/app/tools/glyph-creator/style-controls.tsx` (3 sites), dispatching
  `{ type: "set-…-color", color }` where `color` is a **string**.
- Project state stores colors as plain strings (`textColor`, `background.color`).
  ⇒ the migration needs boundary adapters; app state stays string-based.
- Package uses `react-aria-components@^1.19` (not the vanilla-starter wrappers
  the docs examples import — real imports come from `"react-aria-components"`).

## Workspace history
- This workspace previously held a CI/GitHub Actions course. Archived (Tom's
  choice) to `archive/ci-github-actions/` on 2026-07-20. Can be restored later.

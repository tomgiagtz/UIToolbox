# Adopting third-party React components — Glossary

Vocabulary for reading a React Aria component's docs and wiring it into a
string-based app. Terms use React Aria / React's own wording where it exists.

## Terms

**Controlled component**:
A component whose value lives in *your* state; you pass it down via `value` and
update it in `onChange`. The existing `ColorField` is controlled on a `string`.
_Avoid_: "stateful component" (the state is yours, not the component's)

**`Color` object**:
React Aria's value type for a color — an immutable object (not a string) that
knows its channels and can convert between formats. Created with `parseColor()`.
_Avoid_: "the color string", "the hex" (the whole point is that it isn't one)

**`parseColor(str)`**:
The adapter that turns a CSS color string into a `Color` object. The *entry* to
the boundary: string in your app → object at the component.
_Avoid_: "convert", "cast" (it parses and validates)

**`toString(format)` / `toFormat(space)`**:
Methods on a `Color` that serialise it back to a string (`'hex'`, `'rgb'`, …) or
re-express it in another color space. The *exit* of the boundary.
_Avoid_: "format the color" (be specific: serialise vs. re-express)

**Channel**:
One scalar component of a color — `red`, `hue`, `saturation`, `alpha`. A `Color`
holds several; a `ColorField` with a `channel` prop edits exactly one.
_Avoid_: "value", "field" (a channel is data; a field is the UI editing it)

**Color space**:
The coordinate system a color is expressed in — `rgb`, `hsl`, `hsb`. The same
`Color` can be *read* in any space; `colorSpace` on a field picks which.
_Avoid_: "format", "mode"

**`ColorPicker`**:
The React Aria container that owns one `Color` and shares it with its children.
Has no visual of its own — it's the state hub. Takes `value`/`onChange`.
_Avoid_: "the widget", "the input" (it renders nothing itself)

**Subcomponent (of a compound component)**:
A child like `ColorField`, `ColorSlider`, `ColorArea` that reads and writes the
shared color from its parent `ColorPicker` — no props threaded between them.
_Avoid_: "child prop", "nested input"

**Compound component**:
The pattern where a parent and its children cooperate through React Context, used
as `<ColorPicker><ColorField/></ColorPicker>`. State is shared implicitly.
_Avoid_: "wrapper component", "HOC"

**Boundary adapter**:
The `parseColor` / `toString` pair you place where a string-based app meets an
object-based component, so neither side has to change to accommodate the other.
_Avoid_: "glue", "hack" (it's a deliberate seam)

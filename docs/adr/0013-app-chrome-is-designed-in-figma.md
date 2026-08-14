# ADR-0013: The app chrome is designed in Figma and shipped from globals.css

- **Status:** Accepted — nothing built. Every section is filed as an issue off
  this ADR.
- **Date:** 2026-08-12
- **Amended:** 2026-08-14 — §7 adds motion to the token set, and §8 names the
  surfaces and the accent
- **Amends:** ADR-0001 (its "restyle without fighting a dependency" gets a place
  where the restyle is decided, and Storybook stops being the only visual surface)

## Context

The app has no visual system. `src/app/globals.css` is 105 lines of stock
shadcn "neutral" — every colour is `oklch(L 0 0)`, literally zero chroma. There
are no typography tokens at all: no `next/font`, no `--font-*`, type is raw
Tailwind (`text-3xl font-bold tracking-tight`) scattered across ~16 files. There
are no spacing tokens. `.dark` is fully specified at `globals.css:39-62` and
**nothing in the app ever toggles it** — no theme switcher exists.

The primitives layer is one component, `src/components/ui/button.tsx`. The
de-facto second one is `inputClass`, an exported string at
`src/app/tools/glyph-creator/controls-ui.tsx:26` — a component token living in a
feature file.

Meanwhile a Figma file already exists and is further along than the code:
**`GlyphCreator`**, file key `Ooagmqn84uJlF2TwBtcyoD`. It holds a layout
wireframe, two `generate_figma_design` captures of the running app, annotated
explorations of the Style panel's information architecture, six real components
with component properties and slots, five text styles, and two colour variables.

So this is not "restyle an existing system", and it is also not greenfield. It
is a code side with no system and a design side with a partial one, and no
agreed relationship between them.

**The forcing question is not "what should it look like".** It is: when the two
disagree, which one is wrong?

## Decision

### 1. Figma decides the look; `globals.css` is what ships

Figma is where an app-chrome visual decision is **made and reviewed**.
`globals.css` is where it is **true**. The truth hierarchy is unchanged — ADR >
code > CONTEXT.md — and a Figma file is not an ADR. A token that exists in
Figma and not in `globals.css` has not shipped, and a reviewer resolving a
conflict reads the CSS.

The contract between the two is **`codeSyntax.WEB` on every variable**, set to
the `var()` form of the real custom property: `var(--color-bg-primary)`, never
the bare `--color-bg-primary`. That makes the mapping mechanical and reviewable
in Dev Mode, and it is what makes hand-syncing honest rather than a guess.

**No token pipeline.** ~25 tokens hand-carried and reviewed in a PR diff costs
less than a generator plus its drift gate — and the three existing generators
(`symbols.generated.ts`, `pad-layouts.generated.ts`, and ADR-0012 §5's presets)
each pay for themselves on data the app _parses_. Nothing parses a colour ramp.
This is revisited if the token count passes ~100 or a second theme lands.

**Code Connect is deferred.** It maps a stable Figma component to a stable code
component, and today neither side is stable — the Figma components are named for
a different app (§4) and the code ones mostly don't exist. Mapping now would
freeze both mistakes.

### 2. The Starter tier is a design constraint, not an inconvenience

The file lives on a Figma **Starter** plan. That caps the file at **3 pages**,
allows **1 mode per variable collection**, and cannot publish a library. Each
one removes an option that the obvious design-system playbook assumes:

| Playbook default                       | Why it's unavailable  | What we do instead                                     |
| -------------------------------------- | --------------------- | ------------------------------------------------------ |
| One page per component                 | 3-page cap            | Sections within one `Components` page                  |
| Light/Dark as variable modes           | 1 mode per collection | One theme, §3                                          |
| Subscribe the library from other files | No publishing         | One file; the library is a reference, not a dependency |

Page budget: `Page 1` (existing exploration — **never touched by this work**),
`Design System` (currently empty; becomes Foundations + Components), and one
page held in reserve for screens.

The reserve page is the part worth stating: it means **screens are the thing
that gets cut** if the budget is wrong, not foundations. Redesigning the Glyph
Creator's layout is the most visible work and the least load-bearing, and it
collides with #45 and #39 besides.

### 3. One theme, and it is dark

`.dark` is deleted rather than maintained. Keeping it would mean hand-maintaining
a second palette that the design file **cannot model** at all — the modes that
would make it a first-class artifact are a paid feature — so the second theme
would be code-only, unreviewable, and permanently drifting from the file that is
supposed to decide the look. A theme nothing can toggle and nothing can review
is not a feature, it is 24 lines that will be wrong.

Dark rather than light because the atlas preview is a dark canvas the chrome
sits against, and because `--glyph-highlight-fill: oklch(1 0 0 / 0.4)` and
`--input-fill-primary` were already written assuming a dark backdrop.

**This is knowingly against the grain of what is already drawn.** Every existing
Figma component is light — `#F8FAFC` fields on white, `#202020` text — so this
decision costs a repaint of six components. It is taken now precisely because
that cost only grows: the repaint is cheap while the components are unbound, and
expensive once they are bound to variables and instanced into screens.

Nothing about the decision is structural. A second theme becomes a collection
mode the day the plan is upgraded, and the semantic layer in §5 is the thing
that makes that a mode addition rather than a rewrite.

### 4. Figma names the primitive; code keeps the domain name

The two sides have named the same things differently, and the reflex — pick one
vocabulary — is wrong here, because the names are not competing. They sit at
different layers.

| Figma component                | Code today                                    | Relationship                          |
| ------------------------------ | --------------------------------------------- | ------------------------------------- |
| `HorizontalSelectBox` + `Item` | `StyleScopeSwitcher` (`style-controls.tsx`)   | primitive / a use of it               |
| `SettingsGroup`                | `PanelSection` (`panel-section.tsx`)          | primitive / a use of it               |
| `TextInput`                    | `Field` + `inputClass` (`controls-ui.tsx:26`) | primitive / a use of it               |
| `ColorPicker`                  | `ColorField` (`controls-ui.tsx`)              | primitive / a use of it               |
| `SettingsSubGroup`             | —                                             | primitive with no code equivalent yet |

A **Style Scope** is a CONTEXT.md term (ADR-0006's cascade); a horizontal select
box is not. `StyleScopeSwitcher` is the right name for the composition that
knows about the Style Cascade, and the wrong name for the segmented control
underneath it. So both names stay, at their own layer, and
`src/components/ui/` takes the primitive names.

**One exception, and it is a real rename.** `SettingsGroup` / `SettingsSubGroup`
are named for a screen this app does not have — there are no Settings, there is
an **Editor** rail holding Devices / Inputs / Style. The word has to go before it
gets instanced, because the fastest way to grow a wrong concept is to name
twenty things after it.

### 5. Two collections: primitives, then semantics

```
Primitives   1 mode   raw ramps, scopes [] (hidden from pickers)
Semantic     1 mode   aliased to primitives, scoped, codeSyntax set
```

Semantic variables **alias** primitives and never restate a raw value. On a
single-mode plan this looks like pure ceremony — one mode, so the indirection
buys nothing today. It is taken anyway because it is exactly the seam a second
mode is added at (§3), and adding the seam later means rebinding every component
instead of adding a mode to a collection.

Every variable gets explicit `scopes`. `ALL_SCOPES` is the default and it
pollutes every property picker in the file with every token, which is how a
design system stops being usable by the person who built it.

### 6. Cal Sans stays; Calibri does not

`Header 1/2/3` are **Cal Sans** at 36/24/20. That is a real choice and it
survives — it is a display face with actual character, and the app has none.

`Body 1` (14) and `Text` (12) are **Calibri**, and that is not a choice — it is a
Windows system font, i.e. what a font picker falls back to. It ships nowhere, it
is unavailable to most visitors, and `next/font` cannot serve it. It is replaced,
and both faces then arrive through `next/font` so they are self-hosted and
preloaded rather than assumed.

Every existing style has `lineHeight: AUTO`. A type scale without line heights
is half a type scale; the replacement sets them explicitly.

### 7. Motion is a token, and Figma holds it as a reference

The app has no motion. Not "inconsistent motion" — none: no motion custom
properties, no presets, no motion library, and exactly one explicit duration in
`src/` (`duration-75` on the atlas preview crosshair, which is Glyph-domain
canvas feedback and stays out of this). Popovers, tooltips and the Editor rail's
disclosures all appear and disappear instantly.

Motion joins the token set on the same two-layer shape as colour (§5) — four
timing primitives, and roles that alias them:

| Layer     | Token                                | Value                   |
| --------- | ------------------------------------ | ----------------------- |
| Primitive | `duration/xfast`                     | 0.2s                    |
| Primitive | `duration/fast`                      | 0.3s                    |
| Primitive | `duration/medium`                    | 0.4s                    |
| Primitive | `duration/slow`                      | 0.6s                    |
| Semantic  | `motion/popup/{duration,easing}`     | → `xfast`, decelerating |
| Semantic  | `motion/container/{duration,easing}` | → `medium`, in-out      |

Two roles, because two things move for different reasons. A **popup** is a
means to an end and gets the fastest step — an overlay that lags reads as
broken. A **container** resizing in place _is_ the thing being watched, so it
gets room. `fast` and `slow` land as steps with no role bound to them yet; a
component reaches for a role, never for a raw step, which is the same rule §5
puts on colour.

**Figma cannot bind these to anything, and that is fine.** There is no duration
scope on a `FLOAT` variable — a number variable cannot drive a Smart Animate
duration — so the motion tokens take `scopes: []` and exist as a readable,
editable list in the Variables panel and Dev Mode. That makes Figma the place
the timing is _decided and reviewed_, which is all §1 ever asked of it. The
`s` suffix lives only in `globals.css`; Figma stores the number.

Motion is where the "no pipeline" bet (§1) is most exposed, because a duration
that drifts is invisible rather than wrong-looking. The mitigation is that a
role is one custom property read by one CSS class, so there is exactly one place
to look.

### 8. Surfaces are named for the app's layering, not shadcn's slots

`globals.css` inherited shadcn's `--background` / `--card` / `--popover` /
`--muted`, which are named for the components shadcn ships rather than for how
this app stacks. They become a surface scale — `base`, `raised`, `overlay`,
`sunken`, `hover` — at the declaration site, and `@theme inline` keeps shadcn's
utility names resolving so a component vendored through `components.json` still
styles itself.

The forcing case is `accent`. shadcn means **hover surface** by it, and every
one of the app's `bg-accent` call sites is a `hover:`. A brand accent is a
different thing that wants the same word, and two meanings on one token is the
failure §4 describes at the component layer. So the hover role is renamed to
`--surface-hover` and `--accent` is the brand accent — the one place a
compatibility alias is deliberately refused, because keeping it would repaint
every hover in the app the day #99 picks a hue.

`--accent` ships holding the grey it already held. The slot is the decision
here; the colour is #99's, and this ADR's "which hue" is still out of scope.

## Consequences

- **Six existing Figma components are repainted dark and rebound to variables.**
  They are not rebuilt — their component properties and slots (`Slot`, `Label`,
  `Description`, `Placeholder`) are the useful part and survive.
- **`.dark` is deleted** (`globals.css:68-93`), along with the four `.dark`
  overrides of `--input-fill-*` / `--input-border-*`. The `dark` custom variant
  at `globals.css:4` goes with it.
- **`globals.css` gains font tokens and loses the assumption of light.** `:root`
  is rewritten as the dark palette rather than gaining a class.
- **`inputClass` (`controls-ui.tsx:26`) stops being a string** and becomes a
  component in `src/components/ui/`.
- **The axe gate becomes the palette's acceptance test.** WCAG 2.1 AA is enforced
  in CI (`e2e/axe.ts`, Storybook's a11y addon), so a palette that fails contrast
  fails the build — which means contrast is checked in Figma, before it lands,
  not discovered afterwards.
- **Storybook stops being the only place the system is visible**, but does not
  stop being the gate — it is where a component is proven against the real
  tokens, which a Figma frame cannot do.
- **A motion role is a CSS class, not a `className` string.** `motion-popup` and
  `motion-container` are `@utility` rules in `globals.css`, next to the custom
  properties they read — putting them in a feature file would repeat exactly the
  `inputClass` mistake #103 exists to undo. `motion-container` transitions
  `height` off `--disclosure-panel-height`, which react-aria's `useDisclosure`
  sets and then waits on via `getAnimations()`; both roles no-op under
  `prefers-reduced-motion`.
- **Every surface utility in `src/` speaks the new vocabulary.**
  `bg-background` → `bg-surface-base`, `bg-popover` → `bg-surface-overlay`,
  `bg-muted` → `bg-surface-sunken`, `hover:bg-accent` → `hover:bg-surface-hover`.
  The shadcn names survive only as aliases in `@theme inline`, and `accent` is
  not among them.
- **Two primitive stacks still coexist and this ADR does not settle it.**
  `button.tsx` is shadcn/Radix; `controls-ui.tsx`, `panel-section.tsx` and
  `style-controls.tsx` use `react-aria-components` directly. Designing a
  component in Figma does not require knowing which, but _promoting_ one into
  `src/components/ui/` does. Filed separately.

## Out of scope

- **Redesigning the Glyph Creator's layout.** Tokens and primitives first; the
  `w-160` two-column workbench (`glyph-creator.tsx:498-660`) is a larger
  conversation that collides with #45 and #39.
- **Glyph-domain styling.** Presets, Paint Roles, the Xbox palette (#75) are
  what the _user's_ Glyphs look like. This ADR is about the app's own chrome, and
  the two vocabularies must not be allowed to merge.
- **Which hue, which body face, which spacing scale.** Content, not machinery,
  and downstream of everything decided here.

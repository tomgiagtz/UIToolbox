# ADR-0012: A Catalog says what is present; a Preset says what it looks like

- **Status:** Accepted — partly built. §1 and §2's three-tier cascade and Catalog
  seeds landed with #78, §2's two layer transforms with #79, and §2's font plus
  §6/§7's `fonts` manifest and multi-slot storage with #80, §5's shipped
  Presets — sources, manifest, build gate and generated module — with #82, and
  §3's apply path plus §4's picker with #83; §7's blocking missing-assets modal
  is still filed as an issue off this ADR.
- **Date:** 2026-07-30, redrafted 2026-07-31, accepted 2026-08-06, migration's
  land-as-one-change requirement withdrawn 2026-08-07, §2's per-Glyph-only
  `background.source` withdrawn 2026-08-08, §2's font placement corrected and
  weight added 2026-08-13, §4's taken-Device rule narrowed to the Catalog
  selection 2026-08-18
- **Amends:** ADR-0006 (the cascade loses a tier, gains font and two transforms,
  loses `contentScale`, and `cellSize` moves without changing status), ADR-0007 §3
  (its four-tier framing of `symbolPaints`, and where the brand palette ships),
  ADR-0008 (`contentScale` is replaced by `foreground.transform`), ADR-0009 (`flipX`
  leaves the authored-source union)
- **Supersedes:** its own first two drafts — the layered-config model, and the
  preset-is-a-serialized-`Project` model that replaced it

## Context

Issue #37 asked for a `symbolPaints { fill, border, secondary }` group resolving
through all four cascade tiers. Almost all of it had already landed with the
issue #17/#18 slices — the group, its three flattened `StyleField`s, merge /
clear / resolve, the renderer path, the persisted shape, and the Style panel
controls. One scope line had not: _"ship the Xbox brand palette (A green, B red,
X blue, Y yellow) at the Catalog-per-Input default tier."_

Trying to build that one line surfaced two problems, one small and one
structural.

**The small one.** `xbox-symbols.svg`'s `a` cell is a single path — the letter
"A" outline, painted in the `fill` sentinel. There is no backer disc in the art,
and the face buttons ship no Authored Background, so they land on the project
default rounded-rect. Setting `symbolPaints.fill` green therefore renders _a
green letter A on a slate rectangle_, not a green disc with a light letter. The
brand colour on a real face button is the **backer**, which in this codebase is
the Background, not a Symbol paint. The scope line was written against an
imagined art model the shipped assets don't have.

**The structural one**, which is why this ADR exists. Chasing where that default
should live exposed that `DeviceCatalog` and `DeviceConfig` are near
mirror-images with a hole punched in each side:

| Cascade scope     | Present in `Project`        | Present in `DeviceCatalog`         |
| ----------------- | --------------------------- | ---------------------------------- |
| Project           | ✅ full `GlyphStyle` fields | ❌ absent                          |
| Device            | ✅ `device.style`           | ❌ **absent**                      |
| Catalog-per-Input | ❌ **absent**               | ✅ `CatalogInput.defaultStyle`     |
| Glyph             | ✅ `device.glyphStyles`     | ❌ absent (correctly — user space) |

A shipped Catalog **cannot express a Device-tier default** at all —
`createDeviceFromCatalog` hardcodes `style: {}`, so ADR-0007 §3's "the Device
tier may set uniform role defaults" is unshippable as written. And a project
export **cannot round-trip the Catalog tier**, because `Project` has no slot for
it.

### Two drafts, both withdrawn

The **first draft** answered the asymmetry by making a Catalog into layered
config: the cascade restated as two layers (catalog / user) × three scopes,
resolving `catalog[scope]` beneath `user[scope]` at each step. That model exists
to serve one capability — a **Catalog Library** that swaps some scopes into the
user's project while leaving their edits at other scopes intact. Keeping the
layers separate is exactly what makes a selective, non-clobbering swap
expressible.

It was withdrawn once it became clear that two different things were wearing the
word "Catalog": `DeviceCatalog` (the code-maintained registry of known Inputs)
and "Catalog" in the Library sense (a shipped starting configuration). The second
is a preset project you load, and **loading clobbers by definition** — so the
selective-swap capability the layer model was built to serve is not a thing this
tool does, and the separability it buys pays for nothing.

The **second draft** concluded from that a shipped preset simply _is_ a
serialized `Project`, so shipping presets was "close to free": serialization
already exists, and the owner authors a preset with the tool, exports it, and
commits the file. That is also wrong, and the rest of this ADR is what replaced
it. A preset turns out to be **style-only**, and an export is a whole `Project`
carrying `enabled` / `custom` / `name` / `cellSize`. The export is a _source_ for
a preset, not the preset.

## Decision

### 1. The line everything hangs on

> **A Catalog says what is present. A Preset says what it looks like.**

This is true of the data, not just the prose, and it is the test every field
below had to pass.

- A **Catalog** (`DeviceCatalog`) is the code-maintained registry of known Inputs
  for a Device: identity and layout — which Inputs exist, what they are called,
  where they sit, which start enabled, and what shipped art depicts them. A
  shipped configuration _points at_ one via `catalogId`; it can never replace one.
- A **Preset** is a shipped starting **look**. It is a **role**, not a format:
  _ships with the tool and appears in the picker_. A user's export is not a
  Preset; you make one by committing it and listing it.

The incumbent uses of both words give way where they collide.
`DeviceCatalog.preset: string[]` — an internal field with zero user-facing
strings — is renamed **`defaultEnabled`**, which is strictly clearer than what it
replaced, and the glossary term for that subset becomes **Default Selection**.
`src/lib/glyph/presets.ts`, which holds `createDefaultProject` /
`createDeviceFromCatalog`, is renamed too: under the new sense of the word its
filename is actively misleading.

### 2. The Style Cascade, restated

Three tiers, lowest precedence to highest:

```
Project base (full GlyphStyle)  →  Device override  →  Glyph override
```

The **Catalog per-Input default tier is deleted.** `CatalogInput.defaultStyle`
held exactly eight entries, all machine-generated by `shoulder()` — the Xbox
`lb/rb/lt/rt` and PlayStation `l1/r1/l2/r2` bumper and trigger tiles, plus a
mirror flag. Every one of them says _which shipped asset depicts this control_,
which is the same statement `symbolId` makes, and `symbolId` was never a style
tier. An LB is bumper-shaped under a neon Catalog and a monochrome one alike.
That payload is a **presence** fact, so it moves **up into the Catalog** as bare
seed fields beside `symbolId` — not down into a Preset, which was the expectation
this ADR set out to test and rejected.

`CatalogInput` therefore gains loose seed fields — `backgroundId`, `mirrored` —
deliberately **not** grouped into a `seeds: {}` bag, which would invite someone
to regrow `defaultStyle`. `defaultStyle` itself is deleted.

Note this is a change to the **resolver only**. `StyleScope` is already
`project | device | glyph`; the Catalog tier was an invisible wedge between
Device and Glyph, never a selectable scope. No scope disappears from the Style
tab and the reset control keeps its mechanism.

#### `background.source` cascades at every tier; the seed outranks the Device tier

`background.source` is settable at all three tiers, like every other style
property. The protection the shoulders need comes from the seed's **rank**, not
from a hole in a tier.

_Amended 2026-08-08, in place._ As accepted, this subsection read _"What a Glyph
is drawn from is per-Glyph; how it's painted cascades"_ and made
`background.source` **per-Glyph-only**: the Device tier was structurally unable
to name one (`DeviceStyleOverride`, a `source?: never` split, and a launder in
`patchDeviceStyle`). The argument was that a device-wide "everything is a plain
shape" would flatten all four shoulders, and that removing the collision by
construction beat settling it by precedence.

It loses because it priced the collision wrong. A device-wide source is a real
capability — a keyboard whose every key is one uploaded keycap tile, a device
with no backers at all — and the ban traded that away to buy protection the rank
below already provides. The collision was never unsettleable; it just needed an
order.

What the order costs, stated plainly: because a seed outranks the Device tier, a
device-wide source change **no-ops on the eight seeded shoulder Inputs**, and the
only escape is a per-Glyph override. That is deliberate. A seed is a presence fact about _that
control_, so only a statement about that control may overrule it.

Worth recording, because it is the case that motivated the ban: "keyboards may
have square backgrounds while controllers have circle" is `background.shape`,
which has always cascaded at the Device tier and was never touched here.

#### The Catalog seed has an explicit rank

> effective background source = the **Glyph override**, if set; otherwise the
> **Catalog seed**, if that Input has one; otherwise the **Device override**;
> otherwise the **Project base**.

| the user does                   | LB draws                                   |
| ------------------------------- | ------------------------------------------ |
| nothing                         | bumper tile _(seed)_                       |
| project-wide: uploaded tile     | bumper tile _(seed outranks project base)_ |
| device-wide: plain rounded rect | bumper tile _(seed outranks Device)_       |
| device-wide: red fill           | bumper tile, **recoloured red**            |
| on LB: plain shape              | rounded rect _(Glyph override wins)_       |

An Input with no seed (`key-space`, `xbox-a`) falls through on every row — row 3
included, so a device-wide source really does reach every unseeded Input.

**Deleting the Catalog tier removed a style tier, not a precedence position.**
The tier is gone: a Catalog holds no `StyleOverride`, nothing there is
user-editable, and no scope disappeared from the Style tab, because the Catalog
tier was never a selectable one. What survived is an **ordering fact** about one
field — where a seeded `source` sits relative to the tiers that remain. A seed
is not a fourth tier, and the cascade is still three tiers **plus seeded
values**.

The rank is explicit rather than a "only when nothing sets it" fallback because
such a fallback would **never fire**: the Project base is a full `Background` and
`DEFAULT_BACKGROUND` always carries `source: { kind: "shape" }`.

_Erratum, 2026-08-08 (found while building this section)._ The amendment table
below says this supersedes ADR-0006's **tri-state `backgroundId`**. That is right
about the field ADR-0006 named — which ADR-0009 had already deleted when it
replaced the Background's tile fields with the `source` union — but it reads as
retiring the _distinction_, and the distinction survives. On `source`, _omitting_
the field and setting it explicitly to `{ kind: "shape" }` still differ: an
omitted source now falls to the **seed**, so only an explicit value can turn a
bumper's tile off. Row 5 of the table above depends on exactly that. What changed
is the shape of the premise, not the behaviour: the seed outranks the Device tier
directly, where before an entire Catalog tier sat above Device.

**Separability is preserved, not forgone** — the cost the withdrawn draft
accepted is one we don't pay. Reset is `clearOverrideField` on the user's own
`glyphStyles[id]`; because a seed is a base rather than pre-filled user data,
shipped defaults stay distinguishable from user edits, and clearing
`backgroundSource` on LB lands back on the bumper tile rather than falling to the
Device tier. Fresh projects are likewise a non-issue:
`createDeviceFromCatalog` reads the Catalog, so seeds arrive automatically and
`createDefaultProject` is untouched.

#### Font joins the cascade

`GlyphStyle` gains **`fontFamily: string`**; `StyleOverride` gains
`fontFamily?: string`; `StyleField` gains `"font"`; `resolveStyle` folds it like
`textColor`. At **all three tiers**, with no restriction.

ADR-0006's "the font is deliberately not part of this cascade — it stays
Project-global" was right when there was one font and stops applying the moment
there are two. The sibling alternative — a `font?` beside `style` on
`DeviceConfig` — is not cheaper: it still needs its own resolver, its own reset
control, and its own line everywhere tiers are walked, except walking a
_different_ tier set than everything beside it. Inside the cascade it is one `if`
in `resolveStyle`, one `StyleField` case, and the existing fall-up control works
untouched.

**The field holds a family, not an id.** The draw path needs a family and nothing
else (`document.fonts` is keyed by it), an id adds a lookup on every resolve
whose miss has no good answer, and a family is what makes "a Preset may only name
a bundled family" expressible in the type — a Preset naming an _id_ would name
something absent from the user's project, forcing a reserved id range. It also
keeps a preset **source** hand-authorable: `"Inter"` means something,
`font-2.woff2` does not. Uniqueness is already guaranteed, since uploads never
take a user-supplied family (`loadFontFromFile` always generates
`UITBFont-<ts>-<rand>`).

> **Erratum, 2026-08-13 (with #80).** Two corrections, both from this subsection
> having been written before the rest of §2 caught up with it.
>
> **The field lands on `Foreground`, not on `GlyphStyle`.** The two-transform
> subsection below postdates this one and makes a resolved style _exactly_ the
> two layers and nothing else. The font paints the label, which is one of the
> foreground's Render Sources, so it belongs in that layer beside `textColor` —
> one object, one reset row, one panel group. A third top-level field would
> reopen the shape the layer split closed, and would leave the Style panel with
> a control belonging to neither group. Everything else here stands: the
> override rides on `ForegroundOverride.fontFamily?`, `StyleField` gains exactly
> one entry `"font"`, and the field still holds a family rather than an id.
>
> **Weight cascades beside it, as `fontWeight`.** #76 chose static cuts
> specifically to stop a variable file rendering its 400 default while the
> registry claimed SemiBold, and rejected pinning the instance through
> `FontFace` descriptors as machinery only some rows would use. Registering the
> face with its **real axis range** turns out to be the same one-line change for
> every row and fixes the failure properly rather than routing around it — so
> the three families that ship variable files do, and their weight becomes a
> control instead of a decision frozen at vendoring time. Which weights exist is
> read from the file's `fvar` table at registration, never declared beside it,
> so the registry cannot claim a range the bytes don't have.

#### Two transforms replace `flipX` and `contentScale`

```ts
interface LayerTransform {
  /** Degrees clockwise; canonicalised into −180…180 where a rotation is written. */
  rotation: number;
  /** Signed per-axis scale; a negative component mirrors that axis. */
  scale: { x: number; y: number };
}
```

**Rotation happens before scale, about the centre of the cell.** The order is not
a detail: take a device-wide `rotation: 90` on the tile layer under a seeded
`scale.x: -1`. Rotating first mirrors the art along its _own_ axis and then turns
it — the boolean still means "this control faces the other way". Scaling first
would mirror along the cell's horizontal, which after a quarter turn cuts across
the tile and flips a bumper end-for-end instead. Only one of the two orders keeps
`mirrored` meaning one thing at every rotation, and it is the ordinary
translate-rotate-scale of every scene graph.

**Degrees are canonicalised into −180…180, not 0–360, and only where a rotation
is written** — the control's commit and the Preset build gate. Centred on zero
because that is what makes an anticlockwise turn half of a slider rather than the
far end of one, and `-90` is what a hand author writes for a quarter-turn left,
which was the argument for degrees over radians in the first place. Both extremes
are legal and stable: the usual `((d + 180) % 360 + 360) % 360 - 180` maps `180`
to `-180`, so a value already in range is passed through untouched instead.
Resolution does **not** normalise — every finite value already draws correctly
(`deg * π / 180` is right for `-90` and `450` alike), and rotations are never
compared for equality, so making a pure fold do arithmetic on every render would
buy nothing.

One per drawing layer, neither aware of the other: **`background.transform`** for
the tile, and **`foreground.transform`** for whichever Render Source is drawn.

`GlyphStyle` becomes **exactly two layers and nothing else** —
`{ background, foreground }`. The new **`foreground` object** takes the fields
that were loose at the top level and belong to the drawn content: its
`transform`, the label's `textColor`, and the Symbol's `symbolPaints`;
`StyleOverride.renderSource` joins them, so the layer the user edits is whole
even though the resolved one can't carry a Render Source (resolving that needs
the Catalog and the image manifest, not just the cascade).

_Structural symmetry is the wrong argument for this and was the first one
offered._ Had `foreground` held only a transform, the layers would still not have
matched: `background` carries its own paint and the content's paint would have
stayed outside. What the object actually buys is one shape in three places —
`ForegroundOverride` mirrors `BackgroundOverride`, so `mergeOverride`,
`clearOverrideField` and `isOverrideFieldSet` each gain a branch of a type they
already know rather than a fourth shape — and a Style panel that can be read: one
group per layer, every control in a group writing one property of one object.

Sign-as-mirror is safe only because rotation is first-class beside it. Negating a
uniform scale is a 180° rotation, not a mirror — a real trap, and without a
rotation field the sign would be the only channel for orientation and the
encoding would be a pun. With one, signed per-axis scale is the ordinary
decomposition every scene graph uses.

**`contentScale` is deleted**, folded into `foreground.transform.scale` — two fields
scaling one layer is the pair of half-concepts this replaces, so keeping it as
uniform sugar was rejected. It does hand users a way to stretch an uploaded
image, which the renderer currently refuses on their behalf; accepted, because
under an explicit transform that is the user asking rather than the renderer
guessing.

**The transform applies to the whole layer, every source kind** — authored tile,
uploaded tile, drawn primitive alike. `flipX` was meaningful for exactly one
kind, which is the state ADR-0009 wrote itself to eliminate; a layer transform
must not re-create it. `{ kind: "none" }` needs no special case: nothing is
drawn, so the transform is unobservable.

Both transforms cascade at **all three tiers** — a transform is _how it's
painted_, so unlike `source` it is not Glyph-only, and a device-wide rotation is
a legitimate thing to want. Components fall up **independently but resolve by
replacement, never composition**: a Device setting `rotation: 90` and a Glyph
setting `scale.x: -1` both take effect, and a Glyph setting `rotation: 0`
_replaces_ the Device's 90 rather than composing to it. That is the **resolution
semantics** `resolveStyle` already has for every field, and they need no change.

_Corrected while building._ This paragraph originally continued "so no new merge
machinery is needed", and that part was wrong. An override must be sparse **to
the leaf** — `{ rotation?, scale?: { x?, y? } }` — which is one level deeper than
anything that existed, `background.border.width` being the previous deepest. It
is not sparse for tidiness: the Catalog seed supplies `scale.x` alone and
outranks the Device tier, so a transform replaced wholesale would silently erase
a device-wide rotation on exactly the four mirrored shoulders and nowhere else. A
named `mergeTransform` helper is shared by the three functions that need it.

The resolved form is **total** — identity spelled out as
`{ rotation: 0, scale: { x: 1, y: 1 } }`; absence means "fall up" at override
tiers only, never identity.

The **Catalog keeps a bare `mirrored` boolean** on the four left-side shoulders,
projected by the resolver into `scale.x: -1` at the seed rank (above Device,
below Glyph, supplying only the component it seeds). It stores a boolean and
never a transform fragment: a transform-shaped field in `catalog.ts` is the door
the `seeds: {}` decision nailed shut, because it would make `rotation: 15` legal
in the one file that may only say what is present. A boolean can only mean _this
control faces the other way_.

This closes a papercut for free. `flipX` has **no user control today** —
`sourceFromValue` merely preserves the Catalog's flag when you re-pick the same
tile — so deleting `defaultStyle` would otherwise have left a state you can enter
but not leave. The mirror now leaves the source union entirely, so replacing the
source wholesale cannot touch orientation; `sourceFromValue` is deleted and no
compensating control is needed.

**And it opens a smaller one, knowingly.** Because the seed now supplies two
independent things, the mirror outlives the tile it arrived with: a user who
points LB at their own uploaded art — already drawn facing left — gets it
flipped, because nothing they did was a statement about the transform. Today that
state is unreachable, since orientation rides inside the source and goes with it.

It is accepted rather than fixed. The fix would be to condition the seeded
transform on the resolved source still being the seeded tile, which re-couples
orientation to art — the exact defect being removed — and makes the seed's rank
depend on the outcome of another field's resolution, so `resolveGlyphStyle` stops
being a straight ordered fold. The honest statement is that the mirror belongs to
**the control's place on the device**, not to the art: LB faces left whatever you
put there, until you say otherwise. And you can now say otherwise, which is the
half of this that today's code cannot do at all.

### 3. A Preset is style-only, in two species that are nearly one thing

**A Device Preset is singular** — one Device, never a set. It carries `style` +
`glyphStyles` + its font family, and **never** `enabled`, `custom`, or `name`.
Where the Device is present its style is replaced and its selection survives;
where it is absent it is created from that Catalog's **Default Selection** and
then styled.

**A Project Preset** is the same mechanism with a wider scope: it also writes the
**Project tier**. Both species sit in **one picker** — the picker is the
definition of the set, so a Preset not listed is not a Preset — and neither
confirms anything.

Style-only is the load-bearing choice. Curating which of ~104 keyboard keys are
enabled is the most laborious thing in the tool, and the earlier "a matching
device is replaced outright, no confirm" was the sharpest edge in the withdrawn
design. The cost is that a Preset no longer brings Devices along; the
device-absent path buys most of it back.

**Off-limits to both species:** project `name`, `cellSize`, `naming`,
`filenameTemplate`, and `images`. After §5 this needs no policing — a Preset is
not a `Project` and has no field those could ride in.

**A Preset may never carry bytes.** No font bytes (bundled family names only) and
**never an `imageId`** — it may point only at shipped Symbols and Authored
Backgrounds.

### 4. The card is not the promise; the preview is

_If they see it, they get it_ — the rule that justified full specification — was
written for a Preset that carried its own Device, and §3 took the Device away. A
Device Preset restyles **your** selection: the author styled ~24 keyboard keys and
you have 60 enabled, or 8. No card can show your board.

So the card stops trying. Prototyped against two honest alternatives (a fixed
authored thumbnail, and a live card with a coverage ledger reading "styles 4 of
your 24 Inputs · 20 take the device look · 1 rule lands on nothing" — true,
unreadable in a grid, and answering a question a preview answers by being looked
at), the shape that won demotes the card and promotes the preview:

- **A name list**, each row a fixed 4-tile **swatch** at rail scale, the name, and
  one **pill per Device the Preset covers** — solid where you have that Device,
  hollow where you don't. The swatch is always the _same four Inputs_ per Catalog
  (WASD for a keyboard, the face buttons for a pad): comparing looks requires
  comparing the same subject.
- **A live pane showing your actual atlas**, restyled through the real cascade by
  the same path generation uses, before you commit.
- **No species chip.** The species is said by the action — the button reads
  **Apply to Xbox** or **Apply to Project**.

**Presence is a per-Device toggle**, in the same row that selects what you are
previewing. Style always lands on Devices you have; the toggle governs presence
only:

|                    | taken                                            | untaken                             |
| ------------------ | ------------------------------------------------ | ----------------------------------- |
| **Device absent**  | created from its Catalog's Default Selection     | payload lands nowhere; preview only |
| **Device present** | your selection replaced by the Default Selection | your selection kept, style changes  |

Defaults are asymmetric per Device: **absent → taken** (adding costs nothing),
**present → untaken** (a curated selection is the most expensive thing in the
tool). Still no confirm anywhere — every destructive option is a checkbox whose
consequence is stated beside it.

_Amended 2026-08-18, in place._ Taking a Device you have replaces its **Catalog
selection** only: its **custom Inputs survive**. A Default Selection is a
statement about a Catalog, so it has nothing to say about an off-catalog Input,
and taking a Device must not be the way one gets deleted. The checkbox's sentence
says so where there are any — _"Replaces your Keyboard selection with the 24
default Inputs. Your custom Inputs aren't removed."_ — since disclosure is what
stands in for the confirm. It claims no more than that: the Glyph tier is
replaced with every other tier, so a custom Input survives the apply while the
styling given to it does not.

**Nothing a Preset covers is ever unpreviewable.** The pane materialises every
covered Device — yours where you have it, the Catalog's Default Selection where
you don't. A Device you lack is the **hollow pill plus a sentence**, not a
different card and not an empty state.

Sparseness turned out to be _legible_ rather than dangerous once there is a
preview, so "fully specified" stands. And the two species have nearly collapsed
into one mechanism with a scope: keep both words, but they are not separate
mechanisms.

### 5. A Preset is code, not a file the app parses

**Shipped presets are committed tool exports, projected by a codegen step into a
checked-in typed module, validated once at build time, and never parsed at
runtime.**

```
src/lib/glyph/presets/          # free once presets.ts is renamed (§1)
  sources/xbox-neon.json        # raw tool export, committed as-is
  manifest.mjs                  # id, label, kind, source, catalogId; order == picker order
  build-presets.mts             # the single gate: projects + validates, throws
  presets.generated.ts          # GENERATED, committed, tsc-checked
```

Authoring stays "style it in the tool, export, commit"; the narrow style-only
shape is **derived**, never hand-kept. `npm run presets` projects each source
into `presets.generated.ts`, keeping `style` + font at project tier and, per
Device, `{ catalogId, style, glyphStyles, font? }` — a Project Preset's device
list carries **catalogIds only**, since a missing Device is created from its
Default Selection. Drift as `Project` changes shape is then caught by `tsc`,
inside `glyphStyles` and the `BackgroundSource` union included.

The two alternatives cannot do that. A **plain JSON import** would not typecheck
— TS widens JSON string values to `string`, so `background.source.kind` never
narrows to `BackgroundSource`. A **runtime-guard test** would catch top-level
drift and nothing else, because `isProject` validates `style` and `glyphStyles`
with `isRecord` only; making it useful would first require writing the deep
guards that line deliberately declined to write. Codegen also matches the
established shipped-data precedent (`symbols.generated.ts`,
`pad-layouts.generated.ts`).

A `manifest.mjs` sidecar carries what an export cannot say — its species, its
picker label, and which Device to lift out — with array order as picker order, so
card ordering is reviewable in one diff.

**Every validation rule lives in the build script, as one gate.** It throws on any
`imageId` anywhere; on `name` / `cellSize` / `naming` / `filenameTemplate` /
`images`; on `enabled` / `custom` surviving projection; on an unknown
`catalogId`; on a `glyphStyles` key that isn't a real Catalog Input; on a
`backgroundId` that isn't a shipped Authored Background; and on a font family not
in the bundled registry. It imports `catalog.ts` and `bundled-fonts.ts` directly
and needs **no new dependency** — Node ≥24.18 strips types natively, and both are
leaf modules with no imports at all for it to resolve. (`bundled-fonts.ts` exists
in that shape for exactly this reason, and holds `DEFAULT_FONT_FAMILY` with it;
`defaults.ts` would not do, since it value-imports `DEVICE_CATALOGS` through the
`@/*` alias.)

**ADR-0010's discard-and-report path never applies to a Preset.** That machinery
exists because a persisted config arrives as _untrusted text_, so something must
parse it and parsing can fail. A shipped Preset never arrives as text: it is a
typed constant checked by `tsc` and by CI. `parseConfig`, `LoadResult` and the
`rejected` status line are untouched and never see a Preset. A broken shipped
Preset is a build defect, and a build defect should stop the build rather than
surface as a status line the user can do nothing about.

**All three generators gain the regenerate-and-diff CI step** the pad layouts
already use, closing a real gap: codegen never ran in CI, so retiring a Catalog
Input or an Authored Background would merge green and surface months later for an
unrelated reason.

### 6. `Project` regroups around what each part is for

```ts
interface Project {
  name: string;
  style: GlyphStyle; // <- the block a Preset carries
  fonts: FontAsset[];
  images: ImageAsset[];
  devices: DeviceConfig[];
  exportSettings: {
    cellSize: number;
    naming: { template: string; filenameTemplate: string; case: CaseStyle };
  };
}
```

**`style: GlyphStyle`** is not a new type — `GlyphStyle` already _is_ the fields
`Project` inlines flat, and `resolveStyle(base: GlyphStyle, …)` already takes it
as the Project tier. The code re-assembles it in two places today
(`projectBaseStyle`, and an inline literal in the reducer); both are deleted. The
preset payload and the Project tier of the cascade become one shape with one
shared `isGlyphStyle` guard, so they cannot drift apart. `font` does not survive
as a sibling: it is now `style.fontFamily`.

**`fonts: FontAsset[]`** manifests **uploads only** — `{ family, fileName }`, the
family being the key everything references. No `type` field, unlike `images`:
images need MIME so the blob round-trips as the right kind, fonts don't, because
`FontFace` sniffs the bytes, and a field nothing reads invites someone to start
trusting it. **Bundled families are code** — a `BUNDLED_FONTS` constant beside
`DEFAULT_FONT_FAMILY`, exactly as `DEVICE_CATALOGS` and the Symbol registry are
code. The pickable set is _bundled ∪ `project.fonts`_, assembled at render time
and never stored. Listing bundled families in the manifest would put the shipped
set in two places, which drift the instant a font is added or dropped, leaving
old saves asserting families that no longer exist.

**`exportSettings`** is named for what the Export window configures, not for what
a Preset may not touch. The prohibition needs no structure — after §5 a Preset is
not a `Project`. What justifies the block is that the Export dialog already owns
naming, with a comment saying why ("it only matters at export time"); the type is
catching up to the UI. `filenameTemplate` folds into `NamingConfig`, since
`generate.ts` already cases it with `naming.case`. `name` stays bare — Project
identity, the default filename when saving a project _file_, not an atlas output.
`cellSize` moves but its **sidebar control stays and the dialog mirrors it**: it
is the one atlas value tuned by watching the live grid re-flow, and mirroring is
free because every edit flows through one reducer.

A separate `exportSettings.json` in the ZIP is **rejected** — it breaks the
byte-for-byte interchange between a downloaded JSON file and a localStorage
entry, and kills the plain-`.json` save for a project with no assets. The key
alone meets the requirement.

**`images` and `fonts` stay bare siblings**; no `assets` group. They are
structurally twins, but that cohesion is already carried by behaviour (the
missing-assets modal ranges over both, as does the ZIP writer), and `fonts`
manifests uploads only — `assets` would be a name wrong about half its contents.

### 7. Assets: multi-slot storage, and one blocking modal

`FONT_KEY = "current"` goes; fonts are keyed by family, mirroring the images
store. **No version bump and no migration**: the stored record is
`{ family, fileName, blob }`, which _is_ the new record shape. The key was never
load-bearing — the record has always carried its own `family`, and `"current"`
was just where the one slot lived — so `getAll()` on an untouched database
returns the existing font as a well-formed multi-slot record. This is ADR-0010's
posture paying off: the old shape is the current shape. **Accepted wart:** a
pre-existing user keeps one orphaned blob at `"current"` after their next upload,
since re-uploads mint a fresh family. One unreferenced blob in one browser;
`clear()` already deletes that exact key, and the alternative is the migration
pass ADR-0010 exists to refuse.

The ZIP gains **`fonts/<fileName>`** beside `images/`. The entry keeps the
original filename so it stays meaningful to anyone unzipping by hand, which only
works as a lookup key if it is unique — so uniqueness is minted where the name is
minted, at upload (`Regular.woff2` → `Regular-2.woff2`), and _that_ is stored as
`fileName`. Import becomes the same manifest walk images already use, killing the
**"the font is whatever entry is left over"** heuristic, which cannot survive two
fonts. Bundled families never appear in the ZIP, so a project naming only bundled
families still exports as plain JSON when it has no images.

Manifest rows whose bytes didn't come back — fonts **and** images — are collected
at load and presented in **one blocking modal** with a per-row re-upload. Nothing
recomputes later; bytes only go missing at load. **Two exits, no third:**

- **Fixed** commits the modal's uploads, binding each to its **existing**
  family/id. That is load-bearing: a re-upload running `loadFontFromFile` would
  mint a new family, register the bytes under something nothing references, and
  leave every override broken while the user watched a successful upload do
  nothing. Partial fixes stick; unfixed rows return next load.
- **Ignore** purges — every errored reference cleared at every tier that set it
  via `clearOverrideField`, manifest rows dropped, session uploads discarded. The
  asymmetry is deliberate and survives because it is stated: Ignore is not
  "resolve the rest", it is "I don't have these files, clean the project."

**No Esc**, no backdrop dismissal, no Cancel. This breaks the shared `Modal`
shell's contract, so it needs a `dismissible: false` option or its own shell.

The alternative — a runtime fallback, a missing device font falling through to the
project font — would make `resolveStyle` consult `document.fonts` registration
state, i.e. make a pure fold over plain data depend on async asset loading. Its
neighbours agree: images and Authored Backgrounds both fall back within data they
can see. Note the mechanism was already half-built — an image reference resolves
only `if images.some(i => i.id === chosen.imageId)`, a **manifest** check rather
than a bytes check, so dropping the manifest row already suffices. Clearing the
reference at its tier is the honest completion of that, not a second mechanism.
`repairFontFamily` survives for the case the modal can't cover — a style naming a
family in neither the manifest nor `BUNDLED_FONTS` — widening from "empty string"
to "empty or unknown" and repairing silently as it does today.

## What this amends

| Record                                                      | Change                                                                                                                                                                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ADR-0006** — four-tier cascade                            | **Superseded to three tiers.** The Catalog per-Input tier is deleted; its payload becomes Catalog seed fields with an explicit rank for `background.source`.                                          |
| **ADR-0006** — "the font is deliberately not cascadable"    | **Superseded.** `fontFamily` cascades at all three tiers. `style.ts`'s module doc says the same thing and follows.                                                                                    |
| **ADR-0006** — "cellSize is deliberately not cascadable"    | **Clarified, not superseded.** `exportSettings.cellSize` is still Project-global and still uncascadable; only its path changes.                                                                       |
| **ADR-0006** — tri-state `backgroundId` (its #18 amendment) | **Kept, on a new field.** The distinction survives on `source` (see the erratum below), and `CatalogInput.backgroundId` is itself tri-state: `null` seeds _no_ background, as all four sticks now do. |
| **ADR-0007 §3** — `symbolPaints` through four tiers         | **Superseded** to three. Its "the Device tier may set uniform role defaults; per-Input defaults outrank it" loses its middle term.                                                                    |
| **ADR-0007 §3** — the brand palette ships at Catalog tier   | **Superseded.** There is no such tier. The palette is Preset payload — a Background fill plus a desaturated `symbolPaints.fill` — and is filed separately (#75).                                      |
| **ADR-0008** — `contentScale` joins the cascade             | **Superseded.** `contentScale` is deleted, replaced by `foreground.transform`.                                                                                                                        |
| **ADR-0009** — `flipX` rides inside the authored source     | **Superseded.** Orientation is a layer property, so the source no longer carries it; the union loses `flipX`.                                                                                         |
| **ADR-0009** — a source is settable at any scope            | **Unchanged** (the ban that superseded it was withdrawn 2026-08-08). A source is settable at every tier; a Catalog seed outranks the Device tier for one Input.                                       |
| **ADR-0010** — validate, discard, report                    | **Unchanged, and relied on.** It never applies to shipped Presets, which are never parsed at runtime. It is exactly what makes the migration note below tolerable.                                    |

## Migration

`Project` changes shape three times here — `style` (§6), `fonts` (§6, §7), and
`exportSettings` (§6). The persisted config is validated, not versioned, so a
stored config that fails `isProject` is discarded, its key removed, and the loss
reported. Files share that format with localStorage, so old `.json` saves stop
loading too.

**No version ladder, and no need to land the three together.** This is a pre-1.0
front-end tool with no users, whose one author writes the Presets — so losing a
stored project three times costs exactly what losing it once costs, which is
nothing. The IndexedDB font store needs nothing at all (§7).

_Amended 2026-08-07._ This section originally required the three shape changes to
land as **one change**, so that the reset happened once. **That requirement is
withdrawn.** It was buying a guarantee nobody was paying for, and the price was
one large change where three independently reviewable ones do the same work: the
`style` / `exportSettings` slice alone already touched fifteen files, and
coupling it to §2's cascade-wide `fontFamily` would have doubled that before
anything could be reviewed. The shape changes may now land in any order, one at a
time, and the issues off this ADR are free of each other.

What does **not** change is the discard-and-report behaviour itself. Rejecting a
config that no longer matches the current shape is a correctness rule, not a
data-preservation one — it is what stops a stale payload from half-loading and
corrupting the editor — so ADR-0010's path stays exactly as it is, and each shape
change should keep a test asserting the previous shape is rejected.

## Consequences

- **The four-place tier walk (#51) is re-planned, not subsumed.** It loses a tier
  and loses two of its four sites outright — `projectBaseStyle` and the reducer's
  inline literal both disappear with the `Project.style` nesting rather than
  needing refactoring. It gains a wrinkle: source resolution stops being a pure
  fold over the ordered override list, because the seed needs its own rank, so a
  `tiersFor(project, scope)` returning just the override list no longer covers
  `background.source`. Font adds nothing to the count — it walks with everything
  else.
- **Renderer and compositor lose their `fontFamily` parameter**; the family comes
  off the resolved style.
- **Both layers draw inside one cell clip, and a rotated layer is clipped.** The
  tile is drawn at exactly `cellSize` today and only the content is clipped, so a
  rotated or upscaled tile would overflow into its neighbours in a packed atlas.
  What that clipping looks like differs by source, and all three are accepted: an
  Authored tile rotated 45° shows empty cell corners (the art is square and
  full-bleed), while a **drawn primitive** or a square uploaded tile has its
  corners **cut off** — a circle, meanwhile, is unaffected, so the same rotation
  reads as a bug on one shape and a no-op on another. Auto-inscribing the layer
  to fit its rotated bounds was rejected: it would make rotation silently change
  size, so `rotation: 45` with `scale: 1` would not draw at scale 1, and it takes
  from the user a choice they can make themselves by scaling to ~0.71. Exempting
  the primitive from rotation was rejected outright — a transform meaningful for
  some source kinds and not others is `flipX` again.
- **`StyleField` gains `"font"` and four transform entries —
  `backgroundRotation`, `backgroundScale`, `foregroundRotation`,
  `foregroundScale` — and loses `contentScale`.** Two per layer, not one:
  `style.ts` already states that a field names exactly one setting the user can
  override or clear (which is why `borderWidth` and `borderColor` are separate),
  and rotation and scale are separate controls, so a single reset button would
  have had no honest home between them. `x` and `y` stay together, because
  mirroring is one gesture and the two numbers are one control.
- **The scale control links its axes by default.** Uniform scaling is the
  everyday gesture and `contentScale` served it with one slider, so the panel
  keeps that: linked, one number drives both axes; unlinked, they move
  independently. The toggle is **panel state, never style** — it is how the
  control is being used, not part of the cascade, and storing it would be the
  third half-concept this section exists to remove. Its initial state is derived
  rather than stored: linked when the resolved axes agree, so a seeded shoulder
  (`x: -1, y: 1`) opens unlinked with its mirror visible instead of having it
  silently dragged away.
- **Zero scale is reachable.** The old `contentScale` floor of 0.1 does not carry
  over: the canvas draws nothing through a non-invertible matrix (no error, no
  `NaN`), the value stays visible in the numeric box, one reset undoes it, and it
  is the only way to say "draw the tile but not its content". Skipping it on the
  slider would have required a custom control that tracked drag direction and
  broke keyboard stepping.
- **Deleted outright:** `CatalogInput.defaultStyle`, `sourceFromValue`'s
  flag-preserving `current` parameter — what survives is the `<select>`'s own
  value parser, which has nothing left to carry across a source change —
  `projectBaseStyle`, `GlyphStyle.contentScale`, `BackgroundSource`'s `flipX`,
  `FONT_KEY`, and the "font is whatever entry is left" import heuristic.
  `catalog.ts`'s stale claim that `symbolId` and `defaultStyle` "ship empty until
  those assets land" goes with them — the shoulder tiles landed.
- **The `Modal` shell grows a `dismissible: false` option**, breaking its stated
  promise that everything closing it goes through the dialog itself.
- **Trademark exposure** of shipping brand colours is unchanged from ADR-0004's
  note — and slightly reduced, since brand palettes are now Preset content rather
  than a Catalog default every project inherits.

## Out of scope

- **In-app promotion of a user's project into a Preset.** This is a front-end-only
  tool: the owner authors with the tool, exports, and commits. Preset is a role
  conferred by committing and listing, so there is no "promote" gesture to design.
- **Shipping a whole ready-made project** — devices, selections and all. Presets
  are style-only; "start from this entire project" is what the Load File button
  already does with a file.
- **The Catalog Library that swaps scopes selectively**, and the 2×3 layered
  cascade it required. The first draft's model.
- **Converting the Catalog Input registry into JSON data files.** "Catalogs become
  data" turned out to mean preset projects; the registry stays code-maintained.
- **Which Presets and which font families actually ship** — content, not
  machinery, and downstream of everything decided here. Filed as #75 and #76.

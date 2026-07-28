# ADR-0010: The persisted config is validated, not migrated

- **Status:** Accepted
- **Date:** 2026-07-28
- **Amends:** ADR-0009 (its persisted-schema Consequences). The versioning
  machinery itself predates ADR-0009 and was never the subject of an ADR; this is
  where it gets one, on its way out.

## Context

Every schema change so far shipped with a forward migration. `project-store.ts`
grew a `CONFIG_VERSION`, a versioned `{ version, project }` envelope, and a v1→v5
chain: per-version `ProjectVn` types, per-version validators, per-version
migrators, and a fixture set per step. It reached 664 lines, 376 of them (57%)
validation and migration, against 250 lines of actual persistence.

That machinery protects saved configs that do not exist. The tool is unreleased
and local-only; the only configs in the world are the author's own, and breaking
one costs a re-edit.

Worse, it was distorting the code it protected. ADR-0009's move of "draw nothing"
out of the shape vocabulary is a small type change, but supporting v4-and-older
saves alongside it required a `LegacyShape` / `LegacyTile` / `LegacyBackground`
type family, a Background validator parameterised on which shape vocabulary to
accept, a tile-precedence rule restated in three places, and — the tell — a
comment above `isProject` instructing the next reader **not** to simplify a
two-part predicate, because one half was the only thing rejecting a stale
spelling. A correctness constraint that survives only as prose is a constraint
the design has failed to express.

## Decision

**A persisted config is a bare `Project`, validated against the current shape and
nothing else.**

- No version stamp. `CONFIG_VERSION`, the `{ version, project }` envelope and its
  guard are gone. `serializeConfig` writes the project; `parseConfig` structurally
  validates it or returns `null`.
- No migration. There is one validator, over the current type, with one shape
  vocabulary.
- **The project file format changes with it.** Save/Load shares `serializeConfig`
  / `parseConfig` (`project-file.ts`), so a saved `.json` — and the `config.json`
  inside a saved `.zip` — is now a bare project object. **Every project file saved
  before this change is unloadable.** That is accepted on the same premise: the
  files that exist are the author's, and the alternative is keeping the chain
  alive to serve them.
- **A rejected config is reported to the user**, not swallowed. `loadConfig`
  returns `{ kind: "empty" } | { kind: "rejected" } | { kind: "ok", project }` —
  the old `null` conflated "nothing saved" with "your work was discarded", and
  only the second is worth a message. On `rejected` it also removes the key, so
  the message fires once instead of on every reload until an edit overwrites it.
  The message is set **last** in the mount effect, after the font restore, which
  otherwise overwrites the shared status line.
- The **file-import** path is unchanged: it already reported
  `"…" isn't a valid project file`. The asymmetry is deliberate — a file the user
  chose deserves an error whatever the reason; browser storage is invisible
  plumbing, and only its _loss_ is worth interrupting for.

### Repair on read is still allowed

One rule survives the deletion: a config whose `font.family` is `""` is rewritten
to the bundled default on load. `family` flows unresolved into the canvas font
string (`use-glyph-canvas.ts`, `compositor.ts`), where `""` produces an invalid
declaration that silently draws in the browser default. Pre-#13 configs, saved
before Inter was bundled, carry exactly that.

This is not the thing we just deleted. The cost of the migration chain was never
the repair itself — it was that the chain **scaled with history**: each schema
bump added a version arm, a `ProjectVn` type, a validator, a migrator, and a
fixture set, and the `Legacy*` types it needed leaked into the current-shape
validator. A normalizer has none of that. It is unconditional,
version-independent, idempotent, and O(1) forever: one rule, applied at one
boundary, that never grows. It buys a single canonical persisted form, so no code
downstream of the store ever has to consider `""`.

The bar for adding another: it must hold for **any** config, not for configs of a
particular vintage. A rule that begins "if this was saved before…" is a migration
wearing a normalizer's clothes.

## Consequences

- `project-store.ts` drops to ~360 lines and its test file from 462 to ~140.
  `getCatalogByName` in `catalog.ts` had no caller but the v1 migrator and is
  deleted with it. `catalogNameIndex` is stranded the same way but deliberately
  kept — alias lookup is plausibly wanted soon — and tracked in the dead-export
  audit rather than deleted here.
- The **`isProject` comment is gone along with the hazard it described.** The
  validator is one flat structural predicate over `Project`; there is no second
  vocabulary for it to disagree with.
- This supersedes two Consequences bullets of **ADR-0009**: the persisted schema
  no longer "moves to v5" and rewrites saved `backgroundId` / `flipX` pairs (that
  migration is deleted, and such a save is now rejected), and the validators no
  longer "share a shape-list parameter rather than a constant" — there is one
  validator and one constant. ADR-0009's decision about the union itself stands
  unchanged.
- The **next** schema change breaks saved configs again, loudly and by design.
  When the tool ships to anyone else, this ADR is what must be revisited first —
  and the thing to reintroduce then is a version stamp, which makes "this is too
  old" a distinguishable outcome, before any migrator is written.
- `DB_VERSION` in the IndexedDB section is untouched. It is an object-store
  upgrade path, not a schema migration, and still does real work.

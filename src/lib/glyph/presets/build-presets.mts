// Codegen: project each committed tool export in `sources/` into the narrow,
// style-only Preset shape and bake the lot into `presets.generated.ts`. Run with
// `npm run presets`. See README.md.
//
// This file is **the single gate** (ADR-0012 §5). A shipped Preset is never
// parsed at runtime — it is a typed constant `tsc` checks and CI regenerates —
// so every rule about what a Preset may carry is enforced here, once, by
// throwing. ADR-0010's discard-and-report path is for untrusted persisted text
// and never applies: a broken Preset is a build defect and should stop the
// build.
//
// It is a `.mts` run by Node's native type stripping, with **no new
// dependency**, which is what fixes its import list: it may only reach modules
// that need no alias resolution. `catalog.ts`, `bundled-fonts.ts` and `style.ts`
// qualify — the first two import nothing at all and the third imports only
// types, which stripping erases. The shipped Authored Background ids come from
// `symbols/manifest.mjs` rather than `symbols.ts` for the same reason: that
// accessor value-imports its generated output through `@/`.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLED_FONTS } from "../bundled-fonts.ts";
import { getCatalog } from "../catalog.ts";
import { normalizeRotation } from "../style.ts";
import { SYMBOL_MANIFEST } from "../symbols/manifest.mjs";
import { PRESET_MANIFEST } from "./manifest.mjs";
import type { Preset, PresetDevice } from "../presets.ts";
import type { DeviceConfig, Project } from "../types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "presets.generated.ts");
const SOURCES = join(HERE, "sources");

/**
 * One `manifest.mjs` row: what a tool export cannot say about itself — its
 * species, its picker label, and (for a Device Preset) which Device to lift out.
 */
export interface PresetEntry {
  id: string;
  label: string;
  kind: "device" | "project";
  /** Filename under `sources/`. */
  source: string;
  /** Device Presets only: the one Catalog the export is projected down to. */
  catalogId?: string;
}

/** Every field a Preset may never carry, whatever nesting it turns up at. */
const FORBIDDEN_KEYS = [
  // Project identity and atlas output settings: not a look, and off-limits to
  // both species (ADR-0012 §3).
  "name",
  "cellSize",
  "naming",
  "filenameTemplate",
  // A Device's selection, which a Preset must never spend — an absent Device is
  // created from its Catalog's Default Selection instead.
  "enabled",
  "custom",
  // How a style reaches image bytes, in a Background source or a Render Source
  // override alike. Font bytes are the bundled-family check below; this is the
  // other half of the no-bytes rule.
  "imageId",
  // The uploaded-image manifest those ids point into.
  "images",
];

/** Ids of the Authored Backgrounds the tool ships, the only ones nameable. */
const SHIPPED_BACKGROUNDS = new Set(
  SYMBOL_MANIFEST.filter((a) => a.kind === "background").map((a) => a.id),
);

const BUNDLED_FAMILIES = new Set(BUNDLED_FONTS.map((f) => f.family));

/** Fail the build, naming the Preset the offending value was found in. */
function reject(entry: PresetEntry, message: string): never {
  throw new Error(`preset "${entry.id}" (${entry.source}): ${message}`);
}

/**
 * Deep-copy a style tier, canonicalising every rotation it carries.
 *
 * A rotation is normalised where it is **written** (`normalizeRotation`), and a
 * Preset's last write is here: the tool's own control commits in range, but a
 * hand-edited source need not, and a shipped Preset should read the way the
 * control would have spelled it. The only `rotation` a style holds is a layer
 * transform's, so keying on the name alone can't catch anything else.
 *
 * Otherwise verbatim, deliberately: the style-only shape is *derived* from the
 * export, never hand-kept, so a field added to `GlyphStyle` flows through
 * without this script learning about it — and any field that stops fitting is
 * caught by `tsc` over the generated literal.
 */
function projectStyle<T>(value: T): T {
  if (Array.isArray(value)) return value.map(projectStyle) as T;
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] =
      key === "rotation" && typeof child === "number"
        ? normalizeRotation(child)
        : projectStyle(child);
  }
  return out as T;
}

/**
 * Project one exported Device down to what a Preset says about it: which
 * Catalog it covers, and the two style tiers that land on it. Its name, its
 * selection and its custom Inputs are dropped — presence, not selections
 * (ADR-0012 §3).
 */
function projectDevice(device: DeviceConfig): PresetDevice {
  return {
    catalogId: device.catalogId,
    style: projectStyle(device.style),
    glyphStyles: projectStyle(device.glyphStyles),
  };
}

/** Every object node in a tree, with a readable path to it; the root's is "". */
function* walk(
  value: unknown,
  path: string,
): Generator<[string, Record<string, unknown>]> {
  if (Array.isArray(value)) {
    for (const [i, child] of value.entries())
      yield* walk(child, `${path}[${i}]`);
    return;
  }
  if (value === null || typeof value !== "object") return;
  yield [path, value as Record<string, unknown>];
  for (const [key, child] of Object.entries(value))
    yield* walk(child, path ? `${path}.${key}` : key);
}

/**
 * The no-bytes rule, checked on the **export** — "any `imageId` anywhere"
 * (ADR-0012 §5), which the projection alone can't say: a Device Preset drops
 * every Device but one, so an illegal source would ship clean and its author
 * would never hear that what they committed was illegal.
 *
 * Only bytes are read this strictly. Every other rule is about what *survives*,
 * and holding a dropped tier to them would fail the build over a look the
 * Preset doesn't carry — an uploaded font at the project tier of a Device
 * Preset's export is a legitimate thing to have styled with.
 */
function checkNoBytes(entry: PresetEntry, source: Project): void {
  for (const [path, node] of walk(source, "")) {
    if ("imageId" in node)
      reject(entry, `its export carries "imageId" at ${path}`);
  }
  if (source.images.length > 0)
    reject(entry, "its export uploads custom images, which can never ship");
}

/**
 * The rules that range over the whole payload, checked on the **projection**
 * rather than the export: a tool export always carries a name and export
 * settings, and the question is only ever whether one survived.
 */
function checkPayload(entry: PresetEntry, preset: Preset): void {
  for (const [path, node] of walk(preset, "")) {
    for (const key of FORBIDDEN_KEYS)
      if (key in node)
        reject(entry, `carries "${key}" at ${path || "the root"}`);
    if (
      node.kind === "authored" &&
      !SHIPPED_BACKGROUNDS.has(String(node.backgroundId))
    )
      reject(
        entry,
        `names Authored Background "${node.backgroundId}" at ${path}, which the tool doesn't ship`,
      );
    if (
      typeof node.fontFamily === "string" &&
      !BUNDLED_FAMILIES.has(node.fontFamily)
    )
      reject(
        entry,
        `names font family "${node.fontFamily}" at ${path}, which isn't bundled — a Preset may never carry font bytes`,
      );
  }
}

/** The rules that need the Catalog: that it exists, and that its Inputs do. */
function checkDevice(entry: PresetEntry, device: PresetDevice): void {
  const catalog = getCatalog(device.catalogId);
  if (!catalog) reject(entry, `styles unknown catalogId "${device.catalogId}"`);
  const inputs = new Set(catalog.inputs.map((i) => i.id));
  for (const glyphId of Object.keys(device.glyphStyles))
    if (!inputs.has(glyphId))
      reject(
        entry,
        `styles "${glyphId}", which is not an Input of the ${catalog.id} Catalog`,
      );
}

/**
 * Project one committed export into its shipped Preset, or throw.
 *
 * The two species differ only in scope, so they differ only in what this keeps:
 * a Device Preset is the one Device the manifest names, and a Project Preset is
 * the Project tier plus every Device the export covers.
 */
export function buildPreset(entry: PresetEntry, source: Project): Preset {
  checkNoBytes(entry, source);
  const preset = project(entry, source);
  for (const device of preset.devices) checkDevice(entry, device);
  checkPayload(entry, preset);
  return preset;
}

/** {@link buildPreset}'s projection half; every rule runs over what it returns. */
function project(entry: PresetEntry, source: Project): Preset {
  if (entry.kind === "device") {
    if (!entry.catalogId)
      reject(
        entry,
        "is a Device Preset, so its manifest row needs a catalogId",
      );
    const device = source.devices.find((d) => d.catalogId === entry.catalogId);
    if (!device)
      reject(
        entry,
        `has no ${entry.catalogId} Device in its export to lift out`,
      );
    return {
      id: entry.id,
      label: entry.label,
      kind: "device",
      devices: [projectDevice(device)],
    };
  }
  // A Project Preset writes the Project tier, so it scopes itself; a catalogId
  // here would name a scope the projection silently ignores.
  if (entry.catalogId)
    reject(
      entry,
      "is a Project Preset, so its manifest row may not set catalogId",
    );
  return {
    id: entry.id,
    label: entry.label,
    kind: "project",
    style: projectStyle(source.style),
    devices: source.devices.map(projectDevice),
  };
}

/**
 * Build the whole shipped set, in manifest order — which is picker order, so
 * card ordering stays reviewable in one diff.
 */
export function buildPresets(
  entries: PresetEntry[],
  read: (entry: PresetEntry) => Project,
): Preset[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    // The manifest is a `.mjs`, so its `@typedef` documents the row without
    // `tsc` ever checking one — the rows reach here as unchecked data, and a
    // misspelled `kind` would otherwise build silently as the other species.
    if (entry.kind !== "device" && entry.kind !== "project")
      reject(entry, `has kind "${entry.kind}", which is no Preset species`);
    if (!entry.id || !entry.label || !entry.source)
      reject(entry, "is missing an id, a label or a source");
    if (seen.has(entry.id))
      reject(entry, "repeats an id already in the manifest");
    seen.add(entry.id);
  }
  return entries.map((entry) => buildPreset(entry, read(entry)));
}

/** Read a committed export. Malformed JSON throws with the filename attached. */
function readSource(entry: PresetEntry): Project {
  return JSON.parse(readFileSync(join(SOURCES, entry.source), "utf8"));
}

// Only when run as `npm run presets` — the projection and the gate are imported
// on their own by the tests, which must not write the generated file.
if (import.meta.main) {
  const presets = buildPresets(PRESET_MANIFEST, readSource);
  const banner =
    "// GENERATED FILE — do not edit by hand.\n" +
    "// Regenerate with `npm run presets` after changing a source export in\n" +
    "// `sources/` or `manifest.mjs`. See `README.md`.\n\n" +
    'import type { Preset } from "@/lib/glyph/presets";\n\n' +
    "/** Every shipped Preset, in manifest order — which is picker order. */\n";
  const body = `export const PRESETS: Preset[] = ${JSON.stringify(presets, null, 2)};\n`;
  writeFileSync(OUT, banner + body);
  console.log(`Wrote ${OUT} (${presets.length} presets).`);
}

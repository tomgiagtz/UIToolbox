/**
 * Device Catalogs (ADR-0005).
 *
 * A Device owns a **fixed Catalog** of known Inputs — every keyboard key, every
 * pad button. Each entry has a stable `id`, a default `label`, and (later, once
 * authored) an optional default Symbol and a Catalog per-Input style default.
 * A **Preset** is the default-enabled subset of a Catalog's ids, in generation
 * order: the Keyboard enables ~24 common gaming keys out of a full board; the
 * pads enable their whole Catalog.
 *
 * The Catalog is code-maintained data, not authored art — adding a device means
 * adding entries here, not drawing anything (ADR-0005). The Symbol / authored
 * Background wiring is intentionally left as a skeleton: `symbolId` and
 * `defaultStyle` exist on the type but ship empty until those assets land.
 */
import type { StyleOverride } from "@/lib/glyph/style";

/** One known Input a Device offers. Stable `id`; `label` is its default text. */
export interface CatalogInput {
  /** Stable identity, unique within its Catalog (e.g. "key-space", "xbox-a"). */
  id: string;
  /** Default label shown / rendered for this Input (e.g. "Space", "A"). */
  label: string;
  /** Default Symbol id, once Symbols are authored (skeleton: unset for now). */
  symbolId?: string;
  /**
   * Catalog per-Input style default — the third cascade tier. Lets a bumper keep
   * its authored Background even under a device-wide override (ADR-0006).
   * Skeleton: unset until authored Backgrounds land.
   */
  defaultStyle?: StyleOverride;
}

/** A Device's fixed Catalog plus its default-enabled Preset (ordered ids). */
export interface DeviceCatalog {
  /** Stable Catalog / Device kind id, e.g. "keyboard". */
  id: string;
  /** Display / Device name, e.g. "Keyboard". */
  name: string;
  /** Every known Input, in Device-Layout reading order. */
  inputs: CatalogInput[];
  /** The Preset: default-enabled ids, in the order they generate. */
  preset: string[];
}

// --- Keyboard catalog ------------------------------------------------------

/** Build a keyboard entry: `key-<slug>` id from a stable key name + its label. */
function key(name: string, label: string): CatalogInput {
  return { id: `key-${name}`, label };
}

/** Letters A–Z as individual keys (id `key-a`, label "A", …). */
const LETTERS: CatalogInput[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  .split("")
  .map((c) => key(c.toLowerCase(), c));

/** Digits 0–9 (id `key-0`, label "0", …). */
const DIGITS: CatalogInput[] = "0123456789"
  .split("")
  .map((d) => key(d, d));

/** Function row F1–F12 (id `key-f1`, label "F1", …). */
const FUNCTION_KEYS: CatalogInput[] = Array.from({ length: 12 }, (_, i) =>
  key(`f${i + 1}`, `F${i + 1}`),
);

const KEYBOARD_INPUTS: CatalogInput[] = [
  key("esc", "Esc"),
  ...FUNCTION_KEYS,
  key("backtick", "`"),
  ...DIGITS,
  key("minus", "-"),
  key("equals", "="),
  key("backspace", "Backspace"),
  key("tab", "Tab"),
  key("bracket-left", "["),
  key("bracket-right", "]"),
  key("backslash", "\\"),
  key("caps-lock", "Caps"),
  key("semicolon", ";"),
  key("quote", "'"),
  key("enter", "Enter"),
  key("shift", "Shift"),
  key("comma", ","),
  key("period", "."),
  key("slash", "/"),
  key("ctrl", "Ctrl"),
  key("super", "Win"),
  key("alt", "Alt"),
  key("space", "Space"),
  key("menu", "Menu"),
  key("insert", "Insert"),
  key("delete", "Delete"),
  key("home", "Home"),
  key("end", "End"),
  key("page-up", "Page Up"),
  key("page-down", "Page Down"),
  key("arrow-up", "↑"),
  key("arrow-down", "↓"),
  key("arrow-left", "←"),
  key("arrow-right", "→"),
  // Mouse buttons live on the Keyboard Catalog as common PC Inputs.
  { id: "mouse-left", label: "LMB" },
  { id: "mouse-right", label: "RMB" },
  { id: "mouse-middle", label: "MMB" },
  ...LETTERS,
];

/**
 * The Keyboard Preset: the ~24 common gaming keys enabled by default, in the
 * exact order the tool generated them before the Catalog model. The rest of the
 * board ships in the Catalog but disabled.
 */
const KEYBOARD_PRESET: string[] = [
  "key-w", "key-a", "key-s", "key-d", "key-q", "key-e", "key-r", "key-f",
  "key-space", "key-shift", "key-ctrl", "key-alt", "key-tab", "key-enter",
  "key-esc", "key-arrow-up", "key-arrow-down", "key-arrow-left",
  "key-arrow-right", "mouse-left", "mouse-right", "key-1", "key-2", "key-3",
];

// --- Pad catalogs ----------------------------------------------------------
//
// The pads enable their whole Catalog by default, so each entry list doubles as
// the Preset. Order matches the labels the tool generated pre-Catalog.

function pad(prefix: string, entries: [string, string][]): CatalogInput[] {
  return entries.map(([slug, label]) => ({ id: `${prefix}-${slug}`, label }));
}

const XBOX_INPUTS = pad("xbox", [
  ["a", "A"], ["b", "B"], ["x", "X"], ["y", "Y"],
  ["lb", "LB"], ["rb", "RB"], ["lt", "LT"], ["rt", "RT"],
  ["view", "View"], ["menu", "Menu"],
  ["left-stick", "Left Stick"], ["right-stick", "Right Stick"],
  ["dpad-up", "D-Pad Up"], ["dpad-down", "D-Pad Down"],
  ["dpad-left", "D-Pad Left"], ["dpad-right", "D-Pad Right"],
]);

const PLAYSTATION_INPUTS = pad("ps", [
  ["cross", "Cross"], ["circle", "Circle"], ["square", "Square"],
  ["triangle", "Triangle"], ["l1", "L1"], ["r1", "R1"], ["l2", "L2"],
  ["r2", "R2"], ["share", "Share"], ["options", "Options"],
  ["left-stick", "Left Stick"], ["right-stick", "Right Stick"],
  ["dpad-up", "D-Pad Up"], ["dpad-down", "D-Pad Down"],
  ["dpad-left", "D-Pad Left"], ["dpad-right", "D-Pad Right"],
]);

/** The Catalogs the tool ships, in picker order. */
export const DEVICE_CATALOGS: DeviceCatalog[] = [
  {
    id: "keyboard",
    name: "Keyboard",
    inputs: KEYBOARD_INPUTS,
    preset: KEYBOARD_PRESET,
  },
  {
    id: "xbox",
    name: "Xbox",
    inputs: XBOX_INPUTS,
    preset: XBOX_INPUTS.map((i) => i.id),
  },
  {
    id: "playstation",
    name: "PlayStation",
    inputs: PLAYSTATION_INPUTS,
    preset: PLAYSTATION_INPUTS.map((i) => i.id),
  },
];

/** Find a Catalog by its stable id, or `undefined`. */
export function getCatalog(id: string): DeviceCatalog | undefined {
  return DEVICE_CATALOGS.find((c) => c.id === id);
}

/** Find a Catalog by Device name (used when migrating pre-Catalog saves). */
export function getCatalogByName(name: string): DeviceCatalog | undefined {
  return DEVICE_CATALOGS.find((c) => c.name === name);
}

/** Index a Catalog's entries by id for O(1) label / default lookup. */
export function catalogIndex(
  catalog: DeviceCatalog,
): Map<string, CatalogInput> {
  return new Map(catalog.inputs.map((i) => [i.id, i]));
}

/** The labels a Catalog's Preset resolves to, in generation order. */
export function catalogPresetLabels(catalog: DeviceCatalog): string[] {
  const byId = catalogIndex(catalog);
  return catalog.preset.map((id) => byId.get(id)?.label ?? "");
}

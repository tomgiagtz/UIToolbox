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
   * Other names this Input answers to — the other pad's word for the same
   * physical control ("RB" for a PlayStation R1) and spelled-out forms. Lookup
   * only: an alias never replaces {@link label}, which stays the Input's
   * identity and the source of its Sprite Name.
   */
  aliases?: string[];
  /**
   * Catalog per-Input style default — the third cascade tier. Lets a bumper keep
   * its authored Background even under a device-wide override (ADR-0006).
   * Skeleton: unset until authored Backgrounds land.
   */
  defaultStyle?: StyleOverride;
}

/** A Device's fixed Catalog plus its **Default Selection** (ordered ids). */
export interface DeviceCatalog {
  /** Stable Catalog / Device kind id, e.g. "keyboard". */
  id: string;
  /** Display / Device name, e.g. "Keyboard". */
  name: string;
  /** Every known Input, in Device-Layout reading order. */
  inputs: CatalogInput[];
  /**
   * The **Default Selection**: which ids start enabled on a fresh Device, in the
   * order they generate. Named for what it is rather than "preset", which
   * ADR-0012 gives to a shipped *look*.
   */
  defaultEnabled: string[];
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
const DIGITS: CatalogInput[] = "0123456789".split("").map((d) => key(d, d));

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
 * The Keyboard's Default Selection: the ~24 common gaming keys enabled by
 * default, in the exact order the tool generated them before the Catalog model.
 * The rest of the board ships in the Catalog but disabled.
 */
const KEYBOARD_DEFAULT_ENABLED: string[] = [
  "key-w",
  "key-a",
  "key-s",
  "key-d",
  "key-q",
  "key-e",
  "key-r",
  "key-f",
  "key-space",
  "key-shift",
  "key-ctrl",
  "key-alt",
  "key-tab",
  "key-enter",
  "key-esc",
  "key-arrow-up",
  "key-arrow-down",
  "key-arrow-left",
  "key-arrow-right",
  "mouse-left",
  "mouse-right",
  "key-1",
  "key-2",
  "key-3",
];

// --- Pad catalogs ----------------------------------------------------------
//
// The pads enable their whole Catalog by default, so each entry list doubles as
// the Default Selection. Order matches the labels the tool generated pre-Catalog.

/** The optional half of a pad Catalog entry (see {@link pad}). */
interface PadEntry {
  /** Default Symbol as Render Source (issue #17). */
  symbolId?: string;
  /** Default Authored Background tile, via the per-Input style tier (issue #18). */
  backgroundId?: string;
  /**
   * Mirror that tile horizontally, so a left-side bumper/trigger faces opposite
   * the right-side one it shares right-facing art with.
   */
  flipX?: boolean;
  /** Other names this Input answers to (see {@link CatalogInput.aliases}). */
  aliases?: string[];
}

/**
 * Build a pad Catalog. Each entry is `[slug, label, PadEntry?]`, where the third
 * element carries whatever defaults that Input has. Face buttons the shipped
 * atlases don't yet author simply stay label-rendered.
 */
function pad(
  prefix: string,
  entries: [string, string, PadEntry?][],
): CatalogInput[] {
  return entries.map(
    ([slug, label, { symbolId, backgroundId, flipX, aliases } = {}]) => ({
      id: `${prefix}-${slug}`,
      label,
      ...(symbolId ? { symbolId } : {}),
      ...(aliases ? { aliases } : {}),
      ...(backgroundId
        ? {
            defaultStyle: {
              background: {
                source: {
                  kind: "authored" as const,
                  backgroundId,
                  ...(flipX ? { flipX: true } : {}),
                },
              },
            },
          }
        : {}),
    }),
  );
}

/**
 * A shoulder Input: the four controls the two pads name differently (Xbox
 * LB/RB/LT/RT vs PlayStation L1/R1/L2/R2). `tile` is its Authored Background;
 * left-side ones mirror the shared right-facing art. `aliases` carries the other
 * pad's name plus a spelled-out one, so a control can be found by whichever
 * vocabulary the user knows.
 */
function shoulder(
  tile: "bumper" | "trigger",
  side: "left" | "right",
  ...aliases: string[]
): PadEntry {
  return {
    backgroundId: tile,
    ...(side === "left" ? { flipX: true } : {}),
    aliases,
  };
}

// Asset ids are bare: the Device supplies the scope at resolve time, so both pads
// name the same `bumper` / `dpad-up` and each gets its own drawing.
const XBOX_INPUTS = pad("xbox", [
  ["a", "A", { symbolId: "a" }],
  ["b", "B", { symbolId: "b" }],
  ["x", "X", { symbolId: "x" }],
  ["y", "Y", { symbolId: "y" }],
  ["lb", "LB", shoulder("bumper", "left", "L1", "Left Bumper")],
  ["rb", "RB", shoulder("bumper", "right", "R1", "Right Bumper")],
  ["lt", "LT", shoulder("trigger", "left", "L2", "Left Trigger")],
  ["rt", "RT", shoulder("trigger", "right", "R2", "Right Trigger")],
  ["view", "View", { symbolId: "view" }],
  ["menu", "Menu", { symbolId: "menu" }],
  ["left-stick", "Left Stick", { symbolId: "stick" }],
  ["right-stick", "Right Stick", { symbolId: "stick" }],
  ["dpad-up", "D-Pad Up", { symbolId: "dpad-up" }],
  ["dpad-down", "D-Pad Down", { symbolId: "dpad-down" }],
  ["dpad-left", "D-Pad Left", { symbolId: "dpad-left" }],
  ["dpad-right", "D-Pad Right", { symbolId: "dpad-right" }],
]);

const PLAYSTATION_INPUTS = pad("ps", [
  ["cross", "Cross", { symbolId: "cross" }],
  ["circle", "Circle", { symbolId: "circle" }],
  ["square", "Square", { symbolId: "square" }],
  ["triangle", "Triangle", { symbolId: "triangle" }],
  ["l1", "L1", shoulder("bumper", "left", "LB", "Left Bumper")],
  ["r1", "R1", shoulder("bumper", "right", "RB", "Right Bumper")],
  ["l2", "L2", shoulder("trigger", "left", "LT", "Left Trigger")],
  ["r2", "R2", shoulder("trigger", "right", "RT", "Right Trigger")],
  ["share", "Share", { symbolId: "share" }],
  ["options", "Options", { symbolId: "options" }],
  ["left-stick", "Left Stick", { symbolId: "stick" }],
  ["right-stick", "Right Stick", { symbolId: "stick" }],
  ["dpad-up", "D-Pad Up", { symbolId: "dpad-up" }],
  ["dpad-down", "D-Pad Down", { symbolId: "dpad-down" }],
  ["dpad-left", "D-Pad Left", { symbolId: "dpad-left" }],
  ["dpad-right", "D-Pad Right", { symbolId: "dpad-right" }],
]);

/** The Catalogs the tool ships, in picker order. */
export const DEVICE_CATALOGS: DeviceCatalog[] = [
  {
    id: "keyboard",
    name: "Keyboard",
    inputs: KEYBOARD_INPUTS,
    defaultEnabled: KEYBOARD_DEFAULT_ENABLED,
  },
  {
    id: "xbox",
    name: "Xbox",
    inputs: XBOX_INPUTS,
    defaultEnabled: XBOX_INPUTS.map((i) => i.id),
  },
  {
    id: "playstation",
    name: "PlayStation",
    inputs: PLAYSTATION_INPUTS,
    defaultEnabled: PLAYSTATION_INPUTS.map((i) => i.id),
  },
];

/** Find a Catalog by its stable id, or `undefined`. */
export function getCatalog(id: string): DeviceCatalog | undefined {
  return DEVICE_CATALOGS.find((c) => c.id === id);
}

/** Index a Catalog's entries by id for O(1) label / default lookup. */
export function catalogIndex(
  catalog: DeviceCatalog,
): Map<string, CatalogInput> {
  return new Map(catalog.inputs.map((i) => [i.id, i]));
}

/**
 * Index a Catalog by every name its Inputs answer to — each `label` plus any
 * `aliases` — mapping name to Input id. Labels are written last so a label always
 * wins a collision with some other Input's alias: an alias is a convenience, and
 * must never quietly redirect a name that is already an Input's identity.
 */
export function catalogNameIndex(catalog: DeviceCatalog): Map<string, string> {
  const byName = new Map<string, string>();
  for (const input of catalog.inputs)
    for (const alias of input.aliases ?? []) byName.set(alias, input.id);
  for (const input of catalog.inputs) byName.set(input.label, input.id);
  return byName;
}

/** The labels a Catalog's Default Selection resolves to, in generation order. */
export function defaultEnabledLabels(catalog: DeviceCatalog): string[] {
  const byId = catalogIndex(catalog);
  return catalog.defaultEnabled.map((id) => byId.get(id)?.label ?? "");
}

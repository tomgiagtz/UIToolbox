import type { Background, DeviceConfig, NamingConfig, Project } from "@/lib/glyph/types";

/**
 * The Keyboard Preset: a starting, editable list of common keyboard Inputs
 * seeded onto the Keyboard Device. A Preset is a convenience seed, not a fixed
 * set — the user freely adds/removes/edits these afterward.
 */
export const KEYBOARD_PRESET: string[] = [
  "W",
  "A",
  "S",
  "D",
  "Q",
  "E",
  "R",
  "F",
  "Space",
  "Shift",
  "Ctrl",
  "Alt",
  "Tab",
  "Enter",
  "Esc",
  "↑",
  "↓",
  "←",
  "→",
  "LMB",
  "RMB",
  "1",
  "2",
  "3",
];

/** The Xbox pad Preset. */
export const XBOX_PRESET: string[] = [
  "A",
  "B",
  "X",
  "Y",
  "LB",
  "RB",
  "LT",
  "RT",
  "View",
  "Menu",
  "Left Stick",
  "Right Stick",
  "D-Pad Up",
  "D-Pad Down",
  "D-Pad Left",
  "D-Pad Right",
];

/** The PlayStation pad Preset. */
export const PLAYSTATION_PRESET: string[] = [
  "Cross",
  "Circle",
  "Square",
  "Triangle",
  "L1",
  "R1",
  "L2",
  "R2",
  "Share",
  "Options",
  "Left Stick",
  "Right Stick",
  "D-Pad Up",
  "D-Pad Down",
  "D-Pad Left",
  "D-Pad Right",
];

/** A named starting Preset the user can seed a Device from. */
export interface DevicePreset {
  /** Stable id used by controls; also the seeded Device name. */
  id: string;
  /** Display / Device name, e.g. "Keyboard". */
  name: string;
  /** Ordered starting Input labels. */
  inputs: string[];
}

/**
 * The Presets the tool ships, in the order they appear in the picker. Each seeds
 * one editable Device; a Device carries a copy of the Preset's Inputs so edits
 * never mutate the shared Preset.
 */
export const DEVICE_PRESETS: DevicePreset[] = [
  { id: "keyboard", name: "Keyboard", inputs: KEYBOARD_PRESET },
  { id: "xbox", name: "Xbox", inputs: XBOX_PRESET },
  { id: "playstation", name: "PlayStation", inputs: PLAYSTATION_PRESET },
];

/** Build a fresh, independently-editable Device from a Preset. */
export function createDeviceFromPreset(preset: DevicePreset): DeviceConfig {
  return { name: preset.name, inputs: [...preset.inputs] };
}

/** Fixed default cell edge length (px). */
export const DEFAULT_CELL_SIZE = 128;

/** Default label color. */
export const DEFAULT_TEXT_COLOR = "#f8fafc";

/** Default rounded-rect Background. */
export const DEFAULT_BACKGROUND: Background = {
  shape: "rounded-rect",
  fill: "#1e293b",
  cornerRadius: 18,
  border: { width: 4, color: "#475569" },
};

/** Default Sprite Name config: `{device}_{input}`, snake_case. */
export const DEFAULT_NAMING: NamingConfig = {
  template: "{device}_{input}",
  case: "snake",
};

/** Default output filename template. */
export const DEFAULT_FILENAME_TEMPLATE = "{device}_atlas";

/** Default config name, used as the default filename when saving a project. */
export const DEFAULT_PROJECT_NAME = "my-glyphs";

/**
 * Family name of the bundled default font (Inter, see #13). A fresh project
 * renders with this immediately — no upload required — and an uploaded font
 * simply overrides it. The matching FontFace is registered from the vendored
 * file by {@link loadDefaultFont}.
 */
export const DEFAULT_FONT_FAMILY = "Inter";

/**
 * Build the default project: the Keyboard Device seeded from its Preset, plus
 * default style and naming. The UI holds this as editable state — style, Inputs,
 * Devices, and naming are all changed from here by the user.
 */
export function createDefaultProject(
  fontFamily: string = DEFAULT_FONT_FAMILY,
): Project {
  return {
    name: DEFAULT_PROJECT_NAME,
    font: { family: fontFamily },
    textColor: DEFAULT_TEXT_COLOR,
    background: DEFAULT_BACKGROUND,
    cellSize: DEFAULT_CELL_SIZE,
    devices: [createDeviceFromPreset(DEVICE_PRESETS[0])],
    naming: DEFAULT_NAMING,
    filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  };
}

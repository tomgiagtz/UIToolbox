import type { Background, NamingConfig, Project } from "@/lib/glyph/types";

/**
 * The Keyboard Preset: a starting, editable list of common keyboard Inputs
 * seeded onto the Keyboard Device. A Preset is a convenience seed, not a fixed
 * set — later tickets let the user add/remove/edit these.
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

/** Fixed default cell edge length (px) for the tracer bullet. */
export const DEFAULT_CELL_SIZE = 128;

/** Fixed default label color for the tracer bullet. */
export const DEFAULT_TEXT_COLOR = "#f8fafc";

/** Fixed default rounded-rect Background for the tracer bullet. */
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

/**
 * Build the default single-Device (Keyboard) project used by the tracer bullet.
 * Later tickets replace these fixed defaults with user-configurable state.
 */
export function createDefaultProject(fontFamily: string): Project {
  return {
    font: { family: fontFamily },
    textColor: DEFAULT_TEXT_COLOR,
    background: DEFAULT_BACKGROUND,
    cellSize: DEFAULT_CELL_SIZE,
    devices: [{ name: "Keyboard", inputs: [...KEYBOARD_PRESET] }],
    naming: DEFAULT_NAMING,
    filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  };
}

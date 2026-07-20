import { DEVICE_CATALOGS, type DeviceCatalog } from "@/lib/glyph/catalog";
import type { Background, DeviceConfig, NamingConfig, Project } from "@/lib/glyph/types";

/**
 * Build a fresh Device from a Catalog: its Preset becomes the enabled selection,
 * with no custom Inputs and empty (pass-through) Style Cascade overrides. The
 * enabled array is copied so edits never mutate the shared Catalog Preset.
 */
export function createDeviceFromCatalog(catalog: DeviceCatalog): DeviceConfig {
  return {
    name: catalog.name,
    catalogId: catalog.id,
    enabled: [...catalog.preset],
    custom: [],
    style: {},
    glyphStyles: {},
  };
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
    devices: [createDeviceFromCatalog(DEVICE_CATALOGS[0])],
    naming: DEFAULT_NAMING,
    filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  };
}

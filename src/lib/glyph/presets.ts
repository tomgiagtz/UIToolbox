import { DEVICE_CATALOGS, type DeviceCatalog } from "@/lib/glyph/catalog";
import type { SymbolPaints } from "@/lib/glyph/style";
import type {
  Background,
  DeviceConfig,
  NamingConfig,
  Project,
} from "@/lib/glyph/types";

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

/**
 * Default Symbol Paint Role colours. `fill` (a Symbol's primary ink) follows the
 * label colour so face buttons read like their legend; `border` is a dark grey
 * outline and `secondary` a light grey highlight, giving multi-part symbols depth
 * out of the box. The user can re-split any role through the cascade (ADR-0007).
 */
export const DEFAULT_SYMBOL_PAINTS: SymbolPaints = {
  fill: DEFAULT_TEXT_COLOR,
  border: "#cbd5e1",
  secondary: "#334155",
};

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

/**
 * Default content scale: the Render Source fills the tile's content box exactly
 * as it did before the scale control existed (issue #20).
 */
export const DEFAULT_CONTENT_SCALE = 1;

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
    symbolPaints: DEFAULT_SYMBOL_PAINTS,
    contentScale: DEFAULT_CONTENT_SCALE,
    images: [],
    cellSize: DEFAULT_CELL_SIZE,
    devices: [createDeviceFromCatalog(DEVICE_CATALOGS[0])],
    naming: DEFAULT_NAMING,
    filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  };
}

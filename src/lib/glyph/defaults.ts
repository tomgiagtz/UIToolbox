/**
 * The values a fresh project starts from.
 *
 * Not `presets.ts`: ADR-0012 gives "Preset" to a shipped *look*, and shipped
 * Presets land in `presets/` (§5).
 */
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_WEIGHT,
} from "@/lib/glyph/bundled-fonts";
import { DEVICE_CATALOGS, type DeviceCatalog } from "@/lib/glyph/catalog";
import type {
  GlyphStyle,
  StyleOverride,
  SymbolPaints,
} from "@/lib/glyph/style";
import type {
  Background,
  DeviceConfig,
  ExportSettings,
  NamingConfig,
  Project,
  LayerTransform,
} from "@/lib/glyph/types";

/**
 * The Device tier a fresh Device of a given Catalog starts on — the one shape
 * its controls actually are, where that isn't the Project base's rounded rect.
 *
 * Here rather than in `catalog.ts`, which says only what is *present* and
 * carries no style (ADR-0005). It is an ordinary Device-tier override and not a
 * seed for the same reason: a seed outranks the Device tier and could not then
 * be restyled, while this is just the value the tier opens on, and the user (or
 * a Preset) writes over it like any other.
 */
const CATALOG_DEFAULT_STYLE: Record<string, StyleOverride> = {
  xbox: { background: { shape: "circle" } },
};

/**
 * Build a fresh Device from a Catalog: its **Default Selection** becomes the
 * enabled selection, with no custom Inputs and the Device tier its Catalog opens
 * on ({@link CATALOG_DEFAULT_STYLE}, `{}` for most). The enabled array and that
 * style are copied so edits never mutate shared data.
 *
 * `glyphStyles` stays empty — seeds are read at resolve time, never pre-filled.
 */
export function createDeviceFromCatalog(catalog: DeviceCatalog): DeviceConfig {
  return {
    name: catalog.name,
    catalogId: catalog.id,
    enabled: [...catalog.defaultEnabled],
    custom: [],
    style: structuredClone(CATALOG_DEFAULT_STYLE[catalog.id] ?? {}),
    glyphStyles: {},
  };
}

/** Fixed default cell edge length (px). */
export const DEFAULT_CELL_SIZE = 128;

/** Default label color. */
export const DEFAULT_TEXT_COLOR = "#f8fafc";

/** The colour a fresh project's Background shape is drawn in. */
export const DEFAULT_BACKGROUND_FILL = "#1e293b";

/**
 * Default Symbol Paint Role colours. `fill` (a Symbol's primary ink) follows the
 * label colour so face buttons read like their legend; `border` follows the
 * Background shape's own colour, so a Symbol that draws its own silhouette — a
 * stick's ring, a d-pad's cross — reads as a gap cut out of the ink rather than
 * a second outline over it; `secondary` is a dark grey highlight, giving
 * multi-part Symbols depth out of the box. The user can re-split any role
 * through the cascade (ADR-0007).
 */
export const DEFAULT_SYMBOL_PAINTS: SymbolPaints = {
  fill: DEFAULT_TEXT_COLOR,
  border: DEFAULT_BACKGROUND_FILL,
  secondary: "#334155",
};

/**
 * The identity {@link LayerTransform} — drawn upright, at its natural size. Every
 * resolved style spells this out; only override tiers may leave it absent, where
 * absence means "fall up" rather than identity (ADR-0012 §2).
 *
 * A getter rather than a constant: a resolved style's transform is mutable data
 * handed to a caller, so the two layers must never share one object.
 */
export function identityTransform(): LayerTransform {
  return { rotation: 0, scale: { x: 1, y: 1 } };
}

/** Default rounded-rect Background: the drawn shape, no tile art, drawn upright. */
export const DEFAULT_BACKGROUND: Background = {
  source: { kind: "shape" },
  transform: identityTransform(),
  shape: "rounded-rect",
  fill: DEFAULT_BACKGROUND_FILL,
  cornerRadius: 18,
  border: { width: 4, color: "#475569" },
};

/** Default output filename template. */
export const DEFAULT_FILENAME_TEMPLATE = "{device}_atlas";

/** Default Sprite Name config: `{device}_{input}`, snake_case. */
export const DEFAULT_NAMING: NamingConfig = {
  template: "{device}_{input}",
  filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  case: "snake",
};

/**
 * The base of the Style Cascade a fresh project starts from — the Project tier's
 * full {@link GlyphStyle} (ADR-0012 §6).
 */
export const DEFAULT_STYLE: GlyphStyle = {
  background: DEFAULT_BACKGROUND,
  foreground: {
    transform: identityTransform(),
    fontFamily: DEFAULT_FONT_FAMILY,
    fontWeight: DEFAULT_FONT_WEIGHT,
    textColor: DEFAULT_TEXT_COLOR,
    symbolPaints: DEFAULT_SYMBOL_PAINTS,
  },
};

/**
 * Re-exported so importers that only ever wanted "the default font" don't need
 * to know it comes from the bundled registry's first row (`bundled-fonts.ts`,
 * a leaf module the Preset build gate can import — which `defaults.ts` is not).
 */
export { DEFAULT_FONT_FAMILY, DEFAULT_FONT_WEIGHT };

/** Default atlas output settings: 128px cells, `{device}_{input}` in snake_case. */
export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  cellSize: DEFAULT_CELL_SIZE,
  naming: DEFAULT_NAMING,
};

/** Default config name, used as the default filename when saving a project. */
export const DEFAULT_PROJECT_NAME = "my-glyphs";

/**
 * Build the default project: the Keyboard Device built from its Default Selection, plus
 * default style and naming. The UI holds this as editable state — style, Inputs,
 * Devices, and naming are all changed from here by the user.
 *
 * `fonts` starts empty while the style names the bundled default: the manifest
 * lists uploads, and the default was never one (ADR-0012 §6). `sets` starts
 * empty for the same reason — the shipped Symbol Sets are code (#39).
 */
export function createDefaultProject(): Project {
  return {
    name: DEFAULT_PROJECT_NAME,
    style: DEFAULT_STYLE,
    fonts: [],
    images: [],
    sets: [],
    devices: [createDeviceFromCatalog(DEVICE_CATALOGS[0])],
    exportSettings: DEFAULT_EXPORT_SETTINGS,
  };
}

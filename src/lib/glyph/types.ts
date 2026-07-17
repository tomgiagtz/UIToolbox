/**
 * Domain types for the Input Glyph Creator.
 *
 * Vocabulary follows the CONTEXT.md glossary: Glyph, Input, Device, Preset,
 * Background, Sprite Atlas, Sprite Name. Keep these terms; avoid the synonyms
 * noted in the glossary.
 */

/** The shape of a Glyph's Background tile. "none" yields a label-only Glyph. */
export type BackgroundShape = "rounded-rect" | "square" | "circle" | "none";

/** The tile a Glyph's label is drawn on: shape + fill + optional border. */
export interface Background {
  shape: BackgroundShape;
  /** CSS color of the fill. Ignored when shape is "none". */
  fill: string;
  /** Corner radius in px for the "rounded-rect" shape. */
  cornerRadius: number;
  border: {
    /** Border width in px. 0 means no border. */
    width: number;
    color: string;
  };
}

/** Case style applied when rendering a Sprite Name. */
export type CaseStyle = "snake" | "kebab" | "camel";

/**
 * How Sprite Names are derived. Labels are always slug-normalized (mandatory);
 * the template and case are user-controlled.
 *
 * Template tokens: `{device}`, `{input}`, `{index}`. Default `{device}_{input}`.
 */
export interface NamingConfig {
  template: string;
  case: CaseStyle;
}

/** A Device — a named grouping of Inputs. Each Input is just a label string. */
export interface DeviceConfig {
  /** Display name, e.g. "Keyboard". */
  name: string;
  /** Ordered Input labels, e.g. ["A", "Space", "→"]. */
  inputs: string[];
}

/**
 * The full project configuration — the sole input to {@link generateTilesets}.
 * `font.family` is the registered FontFace family name; the font blob itself is
 * handled by the UI/ProjectStore layer, not this pure model.
 */
export interface Project {
  /** User-facing config name; the default filename when saving a project file. */
  name: string;
  font: { family: string };
  /** CSS color for the label text. */
  textColor: string;
  background: Background;
  /** Square cell edge length in px (default 128). */
  cellSize: number;
  devices: DeviceConfig[];
  naming: NamingConfig;
  /** Output filename template; supports the `{device}` token. */
  filenameTemplate: string;
}

/** An axis-aligned rectangle within a Sprite Atlas, in px. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Both atlas dimensions, each independently padded up to a power of two. */
export interface AtlasSize {
  width: number;
  height: number;
}

/** One placed Glyph: its original label, derived Sprite Name, and cell rect. */
export interface GlyphPlacement {
  label: string;
  spriteName: string;
  rect: Rect;
}

/** The result of packing one Device's Glyphs. */
export interface PackResult {
  atlasSize: AtlasSize;
  placements: Array<{ index: number; rect: Rect }>;
}

// --- TexturePacker-format JSON (ADR-0003) ---------------------------------

export interface TexturePackerFrame {
  frame: { x: number; y: number; w: number; h: number };
  rotated: boolean;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}

export interface TexturePackerDoc {
  /** Sprite Name → frame. Hash form, which Unity and most importers accept. */
  frames: Record<string, TexturePackerFrame>;
  meta: {
    app: string;
    version: string;
    image: string;
    format: string;
    size: { w: number; h: number };
    scale: string;
  };
}

/**
 * Plain-data output for one Device. `atlasSize` is power-of-two on both axes;
 * each placement carries its Sprite Name + cell rect; `metadata` is the
 * TexturePacker document whose frames match the placements exactly.
 */
export interface DeviceOutput {
  device: string;
  atlasSize: AtlasSize;
  cellSize: number;
  placements: GlyphPlacement[];
  metadata: TexturePackerDoc;
  /** Base filename (no extension) for the PNG + JSON pair. */
  filename: string;
}

/**
 * Domain types for the Input Glyph Creator.
 *
 * Vocabulary follows the CONTEXT.md glossary: Glyph, Input, Device, Preset,
 * Background, Sprite Atlas, Sprite Name. Keep these terms; avoid the synonyms
 * noted in the glossary.
 */
import type {
  GlyphStyle,
  StyleOverride,
  SymbolPaints,
} from "@/lib/glyph/style";

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
  /**
   * An **Authored Background** tile id (a shipped SVG from the gallery). When set,
   * the tile is drawn from that SVG — its fill/border sentinels recoloured to this
   * Background's `fill` / `border.color` — in place of the `shape` primitive.
   * Bumper/trigger Inputs default to one via the Catalog per-Input tier (issue #18).
   */
  backgroundId?: string;
  /**
   * Mirror the Authored Background tile horizontally when drawn. The shipped
   * bumper/trigger tiles are right-facing, so the left-side Inputs (LB, LT) set
   * this to face the shape the other way (issue #18). No effect without a
   * {@link backgroundId}.
   */
  flipX?: boolean;
}

/** Case style applied when rendering a Sprite Name. */
export type CaseStyle = "snake" | "kebab" | "camel";

/**
 * An off-catalog Input the user added by hand (ADR-0005). Carries its own stable
 * id (so per-Glyph overrides can key off it) and a free-text label.
 */
export interface CustomInput {
  id: string;
  label: string;
}

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

/**
 * A Device: a fixed Catalog (referenced by {@link catalogId}) with a per-Project
 * **enabled** selection of Catalog ids and a list of **custom** off-catalog
 * Inputs (ADR-0005). Its generated Inputs are the enabled Catalog entries, in
 * order, followed by the custom Inputs.
 *
 * `style` is the Device tier of the Style Cascade and `glyphStyles` the Glyph
 * tier (keyed by Catalog id or custom id); both are sparse and empty by default
 * so a fresh Device resolves to the Project style (ADR-0006).
 */
export interface DeviceConfig {
  /** Display name, e.g. "Keyboard". */
  name: string;
  /** Which {@link DeviceCatalog} this Device draws its known Inputs from. */
  catalogId: string;
  /** Enabled Catalog entry ids, in generation order. */
  enabled: string[];
  /** Off-catalog Inputs, generated after the enabled ones. */
  custom: CustomInput[];
  /** Device-tier style overrides (sparse; `{}` by default). */
  style: StyleOverride;
  /** Per-Glyph style overrides, keyed by Catalog id or custom id (`{}` default). */
  glyphStyles: Record<string, StyleOverride>;
}

/**
 * A user-uploaded **custom image** available as a Render Source (ADR-0004).
 *
 * The manifest only — the bytes are deliberately not in the config: they live in
 * IndexedDB and travel in the project ZIP (ADR-0008). A Glyph pointing at an
 * `id` with no bytes present falls back to its Symbol or label.
 */
export interface ImageAsset {
  /** Stable id, and the entry name inside a project ZIP's `images/` folder. */
  id: string;
  /** The original upload's filename, shown in the UI. */
  fileName: string;
  /** MIME type, so the blob round-trips out of the ZIP as the right kind. */
  type: string;
}

/**
 * One Input resolved for generation: its stable id, effective label, and the
 * effective {@link GlyphStyle} the Style Cascade produced for it.
 *
 * At most one of {@link symbolId} / {@link imageId} is set — the Render Source
 * the cascade resolved (issue #20). With neither, the label is drawn. The label
 * is always populated regardless, since it stays the Input's identity and the
 * source of its Sprite Name (ADR-0004).
 */
export interface ResolvedInput {
  id: string;
  label: string;
  style: GlyphStyle;
  /**
   * Render Source: the Symbol id to draw in place of the label. Well-known
   * Catalog Inputs default to their Symbol via the Catalog per-Input tier.
   */
  symbolId?: string;
  /** Render Source: the {@link ImageAsset} id to draw in place of the label. */
  imageId?: string;
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
  /**
   * Project-tier Symbol Paint Role colours (fill / border / secondary) — the base
   * of the `symbolPaints` cascade group (ADR-0007 §3). Independent of `textColor`.
   */
  symbolPaints: SymbolPaints;
  /**
   * Project-tier scale of the tile content box — the base of the cascade's
   * `contentScale` (issue #20). `1` is the default fit.
   */
  contentScale: number;
  /**
   * Manifest of the user's uploaded custom images (bytes live elsewhere — see
   * {@link ImageAsset}). Shared by every Device, so one upload can serve several
   * Inputs.
   */
  images: ImageAsset[];
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

/**
 * One placed Glyph: its original label, derived Sprite Name, cell rect, and the
 * effective {@link GlyphStyle} resolved through the Style Cascade — so the
 * compositor and preview draw each cell from the same per-Glyph style.
 */
export interface GlyphPlacement {
  label: string;
  spriteName: string;
  rect: Rect;
  style: GlyphStyle;
  /** Symbol id to draw as this Glyph's Render Source, or unset for the label. */
  symbolId?: string;
  /** Custom image id to draw as this Glyph's Render Source (issue #20). */
  imageId?: string;
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
  /** The Device's Catalog id, so the compositor can resolve Symbol overrides. */
  catalogId: string;
  atlasSize: AtlasSize;
  cellSize: number;
  placements: GlyphPlacement[];
  metadata: TexturePackerDoc;
  /** Base filename (no extension) for the PNG + JSON pair. */
  filename: string;
}

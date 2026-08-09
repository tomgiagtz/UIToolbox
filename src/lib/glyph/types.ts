/**
 * Domain types for the Input Glyph Creator.
 *
 * Vocabulary follows the CONTEXT.md glossary: Glyph, Input, Device, Preset,
 * Background, Sprite Atlas, Sprite Name. Keep these terms; avoid the synonyms
 * noted in the glossary.
 */
import type { GlyphStyle, StyleOverride } from "@/lib/glyph/style";

/** The primitive a Background draws when its source is `{ kind: "shape" }`. */
export type BackgroundShape = "rounded-rect" | "square" | "circle";

/**
 * Where a Glyph's Background tile art comes from (issue #22) — the drawn
 * {@link BackgroundShape}, a shipped **Authored Background** SVG, one of the
 * user's uploaded images, or nothing at all. Exactly one at a time, so they can
 * never disagree about what a tile is.
 *
 * A source that can't be honoured falls back to the plain shape rather than
 * failing: an image whose bytes aren't present, or an unknown Authored id, draws
 * as `shape` would.
 */
export type BackgroundSource =
  /**
   * Nothing is drawn behind the content at all — no primitive, no tile art.
   *
   * A *source* rather than a fourth {@link BackgroundShape} because "draw
   * nothing" is a statement about the tile as a whole: a shape can only suppress
   * the primitive, and a Catalog **seed** outranks the Project base, so only a
   * source can turn off the Authored Background a bumper is seeded with.
   */
  | { kind: "none" }
  /** The primitive named by {@link Background.shape}. */
  | { kind: "shape" }
  /**
   * A shipped Authored Background tile, drawn from its SVG with the fill/border
   * sentinels recoloured to this Background's `fill` / `border.color`.
   * Bumper/trigger Inputs are **seeded** with one by their Catalog entry (#18).
   */
  | {
      kind: "authored";
      backgroundId: string;
      /**
       * Mirror the tile horizontally when drawn. The shipped bumper/trigger tiles
       * are right-facing, so the left-side Inputs (LB, LT) set this to face the
       * shape the other way (issue #18).
       */
      flipX?: boolean;
    }
  /**
   * A user-uploaded tile image, referenced by {@link ImageAsset} id. Drawn as
   * authored — never recoloured — fitted to the whole cell (issue #22).
   */
  | { kind: "image"; imageId: string };

/** The tile a Glyph's Render Source is drawn on: source + fill + optional border. */
export interface Background {
  /** Where the tile art comes from; defaults to the drawn {@link shape}. */
  source: BackgroundSource;
  /** The primitive to draw. Read only while {@link source} is `{ kind: "shape" }`. */
  shape: BackgroundShape;
  /** CSS color of the fill. Ignored by a source that draws no primitive. */
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
 * An off-catalog Input the user added by hand (ADR-0005). Carries its own stable
 * id (so per-Glyph overrides can key off it) and a free-text label.
 */
export interface CustomInput {
  id: string;
  label: string;
}

/**
 * How Sprite Names and output filenames are derived. Labels are always
 * slug-normalized (mandatory); the templates and case are user-controlled.
 *
 * Template tokens: `{device}`, `{input}`, `{index}`. Default `{device}_{input}`.
 *
 * `filenameTemplate` lives here rather than beside it because the same `case` is
 * applied to both (see `generate.ts`) — one config, one case style.
 */
export interface NamingConfig {
  template: string;
  /** Output filename template; supports the `{device}` token. */
  filenameTemplate: string;
  case: CaseStyle;
}

/**
 * Everything the Export window configures: how big each cell is rendered and
 * what the resulting sprites and files are called (ADR-0012 §6).
 *
 * Grouped because it is named for what configures it, not for what it excludes.
 * `cellSize` is here despite its sidebar control staying put — it is an atlas
 * output value, Project-global and deliberately outside the Style Cascade
 * (ADR-0006), and the Export dialog mirrors the sidebar's control.
 */
export interface ExportSettings {
  /** Square cell edge length in px (default 128). */
  cellSize: number;
  naming: NamingConfig;
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
   * Catalog Inputs fall back to the Symbol their Catalog entry names.
   */
  symbolId?: string;
  /** Render Source: the {@link ImageAsset} id to draw in place of the label. */
  imageId?: string;
}

/**
 * The full project configuration — the sole input to {@link generateTilesets}.
 * `font.family` is the registered FontFace family name; the font blob itself is
 * handled by the UI/ProjectStore layer, not this pure model.
 *
 * Grouped by what each part is *for* (ADR-0012 §6): a look, the assets that look
 * draws from, the Devices it applies to, and the atlas output settings.
 */
export interface Project {
  /** User-facing config name; the default filename when saving a project file. */
  name: string;
  font: { family: string };
  /**
   * The Project tier of the Style Cascade — a **full** {@link GlyphStyle}, which
   * is exactly the block a Preset carries (ADR-0012 §6). Every Device and Glyph
   * override falls up to here.
   */
  style: GlyphStyle;
  /**
   * Manifest of the user's uploaded custom images (bytes live elsewhere — see
   * {@link ImageAsset}). Shared by every Device, so one upload can serve several
   * Inputs.
   */
  images: ImageAsset[];
  devices: DeviceConfig[];
  exportSettings: ExportSettings;
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

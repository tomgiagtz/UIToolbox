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
   * the primitive, and a Catalog **seed** outranks every tier below the Glyph,
   * so only a source can turn off the tile a bumper is seeded with.
   */
  | { kind: "none" }
  /** The primitive named by {@link Background.shape}. */
  | { kind: "shape" }
  /**
   * A shipped Authored Background tile, drawn from its SVG with the fill/border
   * sentinels recoloured to this Background's `fill` / `border.color`.
   * Bumper/trigger Inputs are **seeded** with one by their Catalog entry (#18).
   */
  | { kind: "authored"; backgroundId: string }
  /**
   * A user-uploaded tile image, referenced by {@link ImageAsset} id. Drawn as
   * authored — never recoloured — fitted to the whole cell (issue #22).
   */
  | { kind: "image"; imageId: string };

/**
 * How one drawing layer is painted into its cell (ADR-0012 §2). One per layer —
 * {@link Background.transform} for the tile, `Foreground.transform` for whichever
 * Render Source is drawn — and neither is aware of the other. The same shape on
 * both, declared once, so the layers cannot drift apart.
 *
 * Applied about the **centre of the cell**, rotating **before** scaling. That
 * order is what keeps a negative component meaning "mirrored" under a rotation
 * set at another tier: the axes it mirrors are the layer's own, not the cell's.
 *
 * Resolved form is **total**: identity is spelled out rather than left absent.
 * Signed scale is the mirror: it is safe to read a negative component that way
 * only because {@link rotation} sits beside it, so the sign is never the sole
 * channel for orientation (negating *both* components is a 180° turn, not a
 * mirror).
 */
export interface LayerTransform {
  /**
   * Degrees clockwise. Any finite value draws correctly; writes canonicalise
   * into −180…180 (`normalizeRotation`), which is the range the control spans
   * and the spelling a hand-authored Preset should carry.
   */
  rotation: number;
  /** Per-axis scale; a negative component mirrors that axis. */
  scale: { x: number; y: number };
}

/** The tile a Glyph's Render Source is drawn on: source + fill + optional border. */
export interface Background {
  /** Where the tile art comes from; defaults to the drawn {@link shape}. */
  source: BackgroundSource;
  /**
   * How the whole tile layer is painted — every source kind alike, since
   * orientation is a property of the layer and not of where its art came from
   * (ADR-0012 §2, superseding ADR-0009's per-source `flipX`).
   */
  transform: LayerTransform;
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
 * A user-uploaded **font**, manifested on the project (ADR-0012 §6).
 *
 * Uploads only. Bundled families are code (`BUNDLED_FONTS`) and are never
 * listed here: doing so would put the shipped set in two places, drifting the
 * moment one is added or dropped and leaving old saves asserting families that
 * no longer exist. So a fresh project is `fonts: []` while still rendering in
 * the bundled default — coherent, because the default was never an upload.
 *
 * As with {@link ImageAsset} the bytes are not in the config: they live in
 * IndexedDB and travel in the project ZIP. A style naming a family with no
 * bytes present is repaired on read (`repairFontFamilies`).
 */
export interface FontAsset {
  /** The registered FontFace family — the key every style references. */
  family: string;
  /**
   * The original filename, disambiguated if it collides, and the entry name
   * inside a project ZIP's `fonts/` folder.
   *
   * There is no `type` field, unlike {@link ImageAsset}: images need their MIME
   * so the blob round-trips as the right kind, while `FontFace` sniffs the
   * bytes. A field nothing reads would only invite someone to trust it.
   */
  fileName: string;
}

/**
 * The three **Paint Roles** an authored SVG's sentinel colours encode
 * (ADR-0007): red is the primary ink, blue the outline, green the highlight.
 *
 * Vocabulary rather than draw code, so it lives here beside the rest of the
 * domain model; `symbol-render.ts` re-exports it for the draw path that has
 * always spelled it.
 */
export type PaintRole = "fill" | "border" | "secondary";

/** The concrete colour each Paint Role resolves to for one drawing. */
export type RoleColors = Record<PaintRole, string>;

/**
 * A paint that is visible but is **not** a sentinel, kept as authored and
 * reported (ADR-0007's literal pass-through).
 *
 * The usual cause is an off-primary export — `#fe0000` where `#ff0000` was
 * meant — which recolours as nothing and would otherwise fail silently, so a
 * flag is carried on the cell rather than logged and lost.
 */
export interface PaintFlag {
  /** The shape's own id, or its tag name. Only ever shown in the flag itself. */
  shape: string;
  prop: string;
  value: string;
}

/**
 * One cell of an imported **Symbol Set**: a standalone Symbol or Authored
 * Background, cut out of the author's atlas.
 *
 * The art is carried in the config as sentinel-painted markup, not as a
 * reference to bytes elsewhere. Unlike an image or a font — whose bytes are
 * opaque, large, and belong in IndexedDB — a windowed cell is a few hundred
 * characters of text that the renderer recolours on every draw, and the file it
 * came from is the author's source rather than the project's copy: a refresh
 * re-reads that path (ADR-0015).
 *
 * No binding to Catalog Inputs is stored. Which Inputs a cell answers for is a
 * fact about the Catalog, re-derived by `bindCell`, so storing it would let a
 * saved project disagree with the Catalog it is opened against.
 */
export interface SetCell {
  /** The author's `<g id>`, and the Symbol id a Glyph references. */
  id: string;
  /** Shown in pickers and the review. Derived from the Catalog until typed. */
  label: string;
  /** Whether {@link label} was typed. A typed label survives a refresh. */
  labelEdited: boolean;
  /** Grid position in the source atlas, in cells. Reading order for the UI. */
  col: number;
  row: number;
  /** Which Paint Roles the art actually uses, in canonical palette order. */
  roles: PaintRole[];
  /** Every non-sentinel paint the cell draws with (see {@link PaintFlag}). */
  flags: PaintFlag[];
  /** Standalone square-viewBox SVG, still painted in sentinels. */
  svg: string;
}

/**
 * A **Symbol Set** the user imported: one authored SVG's worth of cells, plus
 * the default Paint Role colours configured for it (ADR-0014 §3, #39).
 *
 * A Set is not an Asset — it is the shipment that carries them (ADR-0014). It
 * holds exactly what its file draws and nothing else, which is why there is no
 * per-cell removal: the only way to drop a Symbol is to stop drawing it and
 * refresh, so a Set can never drift from its atlas.
 *
 * {@link roleColors} is the Set's own configuration and never travels in the
 * SVG (the structure-only invariant: the file carries ids and sentinels, the
 * project carries colour). A refresh never touches it.
 */
export interface SymbolSet {
  /** Stable id, minted at import from the filename; a Glyph never sees it. */
  id: string;
  /** What to call the Set in the Assets window — the filename by default. */
  name: string;
  /** This Set's default Paint Role colours (ADR-0014 §4). */
  roleColors: RoleColors;
  /** Every cell the source file draws, in reading order. */
  cells: SetCell[];
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
 * Asset bytes (font and image blobs alike) are handled by the UI/ProjectStore
 * layer, not this pure model, which carries only their manifests.
 *
 * Grouped by what each part is *for* (ADR-0012 §6): a look, the assets that look
 * draws from, the Devices it applies to, and the atlas output settings.
 */
export interface Project {
  /** User-facing config name; the default filename when saving a project file. */
  name: string;
  /**
   * The Project tier of the Style Cascade — a **full** {@link GlyphStyle}, which
   * is exactly the block a Preset carries (ADR-0012 §6). Every Device and Glyph
   * override falls up to here.
   */
  style: GlyphStyle;
  /**
   * Manifest of the user's uploaded fonts (bytes live elsewhere — see
   * {@link FontAsset}). The families a project can pick from are these plus the
   * bundled ones, assembled at render time and never stored.
   */
  fonts: FontAsset[];
  /**
   * Manifest of the user's uploaded custom images (bytes live elsewhere — see
   * {@link ImageAsset}). Shared by every Device, so one upload can serve several
   * Inputs.
   */
  images: ImageAsset[];
  /**
   * The **Symbol Sets** the user imported (#39). Shipped Sets are code and are
   * never listed here, for the reason {@link fonts} gives: writing them into the
   * config would put the shipped set in two places.
   */
  sets: SymbolSet[];
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

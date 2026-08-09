import {
  catalogIndex,
  getCatalog,
  type CatalogInput,
} from "@/lib/glyph/catalog";
import { applyTemplate, caseSeparator } from "@/lib/glyph/naming";
import { gridPack } from "@/lib/glyph/packer";
import { slugify } from "@/lib/glyph/slugify";
import {
  resolveGlyphStyle,
  resolveStyle,
  type GlyphStyle,
  type StyleOverride,
  type StyleScope,
} from "@/lib/glyph/style";
import type {
  BackgroundSource,
  CaseStyle,
  DeviceConfig,
  DeviceOutput,
  GlyphPlacement,
  ImageAsset,
  Project,
  ResolvedInput,
  TexturePackerDoc,
} from "@/lib/glyph/types";

/**
 * The Render Source one Glyph actually draws: its font-rendered label, a bundled
 * Symbol, or a user-uploaded custom image (ADR-0004).
 */
export type ResolvedRenderSource =
  | { kind: "label" }
  | { kind: "symbol"; symbolId: string }
  | { kind: "image"; imageId: string };

/**
 * Resolve a Glyph's Render Source from its Catalog entry and the cascade's
 * `renderSource` overrides (highest precedence last), against the project's
 * image manifest.
 *
 * With no override, a well-known Input draws its Catalog Symbol and everything
 * else draws its label — exactly the behaviour that predates the per-Input
 * choice. Every unsatisfiable choice degrades to that default rather than
 * failing: a `symbol` pick on an Input the Catalog ships no Symbol for, and an
 * `image` pick whose asset the project no longer carries (ADR-0004 — a config
 * can outlive its image bytes).
 */
export function resolveRenderSource(
  entry: CatalogInput | undefined,
  images: ImageAsset[],
  ...overrides: (StyleOverride | undefined)[]
): ResolvedRenderSource {
  const fallback: ResolvedRenderSource = entry?.symbolId
    ? { kind: "symbol", symbolId: entry.symbolId }
    : { kind: "label" };

  let chosen: StyleOverride["renderSource"];
  for (const override of overrides) {
    if (override?.renderSource !== undefined) chosen = override.renderSource;
  }
  if (!chosen) return fallback;

  switch (chosen.kind) {
    case "label":
      return { kind: "label" };
    case "symbol":
      return fallback.kind === "symbol" ? fallback : { kind: "label" };
    case "image":
      return images.some((i) => i.id === chosen.imageId)
        ? { kind: "image", imageId: chosen.imageId }
        : fallback;
  }
}

/**
 * The Background source a Catalog **seeds** this Input with (ADR-0012 §2) — the
 * only place a Catalog's presence facts become a style value.
 *
 * `mirrored` projects into `flipX`, where the renderer reads orientation until
 * it moves to `background.transform`.
 */
export function seedBackgroundSource(
  entry: CatalogInput | undefined,
): BackgroundSource | undefined {
  if (entry?.backgroundId === undefined) return undefined;
  // A `null` seed is an explicit absence, and outranks the Device tier as any
  // other seed does; `undefined` above is no seed at all.
  if (entry.backgroundId === null) return { kind: "none" };
  return {
    kind: "authored",
    backgroundId: entry.backgroundId,
    ...(entry.mirrored ? { flipX: true } : {}),
  };
}

/** What the editor's Render Source control needs to know about one Glyph. */
export interface ScopeRenderSource {
  /** The source that Glyph draws today. */
  source: ResolvedRenderSource;
  /**
   * Whether the Catalog offers this Input a Symbol at all — the control hides
   * the Symbol option entirely when it doesn't, rather than offering a choice
   * that would silently resolve back to the label.
   */
  hasSymbol: boolean;
}

/**
 * The Render Source the editor's controls should display at a Glyph-tier
 * {@link StyleScope}, resolved exactly as {@link resolveDeviceInputs} does.
 * `null` at the Project and Device tiers, which address no single Input — and so
 * have no one Render Source to show.
 */
export function resolveScopeRenderSource(
  project: Project,
  scope: StyleScope,
): ScopeRenderSource | null {
  if (scope.tier !== "glyph") return null;
  const device = project.devices[scope.deviceIndex];
  if (!device) return null;
  const catalog = getCatalog(device.catalogId);
  const entry = catalog ? catalogIndex(catalog).get(scope.glyphId) : undefined;
  return {
    source: resolveRenderSource(
      entry,
      project.images,
      device.style,
      device.glyphStyles[scope.glyphId],
    ),
    hasSymbol: Boolean(entry?.symbolId),
  };
}

/** Spread a {@link ResolvedRenderSource} onto the `symbolId` / `imageId` pair. */
function renderSourceFields(
  source: ResolvedRenderSource,
): Pick<ResolvedInput, "symbolId" | "imageId"> {
  if (source.kind === "symbol") return { symbolId: source.symbolId };
  if (source.kind === "image") return { imageId: source.imageId };
  return {};
}

/**
 * The effective {@link GlyphStyle} the Style-tab controls should display at a
 * given {@link StyleScope} — Project shows the base, Device folds in the Device
 * override, Glyph resolves the whole chain including that Input's Catalog seed,
 * exactly as {@link resolveDeviceInputs} does. A scope that points at a missing
 * Device falls back to the Project base.
 */
export function resolveScopeStyle(
  project: Project,
  scope: StyleScope,
): GlyphStyle {
  const base = project.style;
  if (scope.tier === "project") return base;

  const device = project.devices[scope.deviceIndex];
  if (!device) return base;
  if (scope.tier === "device") return resolveStyle(base, device.style);

  const catalog = getCatalog(device.catalogId);
  const entry = catalog ? catalogIndex(catalog).get(scope.glyphId) : undefined;
  return resolveGlyphStyle(
    base,
    seedBackgroundSource(entry),
    device.style,
    device.glyphStyles[scope.glyphId],
  );
}

/**
 * Resolve a Device's generated Inputs (ADR-0005): the enabled Catalog entries,
 * in order, then the custom Inputs. Each Input's effective style is resolved
 * through the three-tier Style Cascade — Project → Device → Glyph — plus that
 * Input's Catalog seed (ADR-0012 §2), so callers get ready-to-draw
 * {@link GlyphStyle}s.
 *
 * Shared by generation and the live preview so both go through the same cascade.
 */
export function resolveDeviceInputs(
  device: DeviceConfig,
  project: Project,
): ResolvedInput[] {
  const base = project.style;
  const catalog = getCatalog(device.catalogId);
  const byId = catalog ? catalogIndex(catalog) : null;
  const resolved: ResolvedInput[] = [];

  /** One Input's resolved pair, from its Catalog entry (absent for custom ids). */
  function resolveOne(
    id: string,
    label: string,
    entry: CatalogInput | undefined,
  ): ResolvedInput {
    const glyph = device.glyphStyles[id];
    return {
      id,
      label,
      ...renderSourceFields(
        resolveRenderSource(entry, project.images, device.style, glyph),
      ),
      style: resolveGlyphStyle(
        base,
        seedBackgroundSource(entry),
        device.style,
        glyph,
      ),
    };
  }

  for (const id of device.enabled) {
    const entry = byId?.get(id);
    // An enabled id with no Catalog entry (stale save) is skipped, not drawn.
    if (!entry) continue;
    resolved.push(resolveOne(id, entry.label, entry));
  }

  // A custom Input has no Catalog entry, so it has neither a Symbol nor a seed.
  for (const { id, label } of device.custom) {
    resolved.push(resolveOne(id, label, undefined));
  }

  return resolved;
}

const TEXTUREPACKER_APP = "UIToolbox Input Glyph Creator";
const TEXTUREPACKER_VERSION = "1.0";

/**
 * The single high core seam: turn the full project config into plain,
 * DOM-free data per Device.
 *
 * All packing, naming, sizing, and metadata logic lives behind this function so
 * the React/Next layer is a thin shell over it, and so the bulk of the tool's
 * risk is covered by one pure Vitest seam.
 */
export function generateTilesets(project: Project): DeviceOutput[] {
  return project.devices.map((device) => buildDeviceOutput(device, project));
}

function buildDeviceOutput(
  device: DeviceConfig,
  project: Project,
): DeviceOutput {
  const { cellSize, naming } = project.exportSettings;
  const inputs = resolveDeviceInputs(device, project);
  const { atlasSize, placements } = gridPack(inputs.length, cellSize);

  const deviceSlug = slugify(device.name);
  const used = new Set<string>();

  const glyphPlacements: GlyphPlacement[] = placements.map(
    ({ index, rect }) => {
      const { label, style, symbolId, imageId } = inputs[index];
      const spriteName = uniqueName(
        applyTemplate(
          naming.template,
          {
            device: deviceSlug,
            input: slugify(label),
            index: String(index),
          },
          naming.case,
        ),
        used,
        naming.case,
      );
      return { label, spriteName, rect, style, symbolId, imageId };
    },
  );

  const filename = applyTemplate(
    naming.filenameTemplate,
    { device: deviceSlug, input: "", index: "" },
    naming.case,
  );

  const metadata = buildTexturePackerDoc(
    glyphPlacements,
    atlasSize,
    `${filename}.png`,
  );

  return {
    device: device.name,
    catalogId: device.catalogId,
    atlasSize,
    cellSize,
    placements: glyphPlacements,
    metadata,
    filename,
  };
}

/**
 * Sprite Names must be unique within an atlas or the metadata's frame map
 * silently drops collisions. Distinct labels can still slugify to the same name
 * (e.g. "→" and "->"), so suffix duplicates with `2`, `3`, … joined using the
 * active case style's separator so the suffix matches the rest of the name.
 */
function uniqueName(
  base: string,
  used: Set<string>,
  caseStyle: CaseStyle,
): string {
  let name = base;
  let n = 2;
  const sep = caseSeparator(caseStyle);
  while (used.has(name)) {
    name = `${base}${sep}${n++}`;
  }
  used.add(name);
  return name;
}

function buildTexturePackerDoc(
  placements: GlyphPlacement[],
  atlasSize: { width: number; height: number },
  image: string,
): TexturePackerDoc {
  const frames: TexturePackerDoc["frames"] = {};
  for (const { spriteName, rect } of placements) {
    frames[spriteName] = {
      frame: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: rect.w, h: rect.h },
      sourceSize: { w: rect.w, h: rect.h },
    };
  }

  return {
    frames,
    meta: {
      app: TEXTUREPACKER_APP,
      version: TEXTUREPACKER_VERSION,
      image,
      format: "RGBA8888",
      size: { w: atlasSize.width, h: atlasSize.height },
      scale: "1",
    },
  };
}

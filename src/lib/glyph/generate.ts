import { catalogIndex, getCatalog } from "@/lib/glyph/catalog";
import { applyTemplate, caseSeparator } from "@/lib/glyph/naming";
import { gridPack } from "@/lib/glyph/packer";
import { slugify } from "@/lib/glyph/slugify";
import {
  resolveStyle,
  type GlyphStyle,
  type StyleScope,
} from "@/lib/glyph/style";
import type {
  CaseStyle,
  DeviceConfig,
  DeviceOutput,
  GlyphPlacement,
  Project,
  ResolvedInput,
  TexturePackerDoc,
} from "@/lib/glyph/types";

/** The Project tier of the Style Cascade: the project's base style. */
export function projectBaseStyle(project: Project): GlyphStyle {
  return { textColor: project.textColor, background: project.background };
}

/**
 * The effective {@link GlyphStyle} the Style-tab controls should display at a
 * given {@link StyleScope} — Project shows the base, Device folds in the Device
 * override, Glyph folds the whole chain (Device → Catalog per-Input default →
 * Glyph) exactly as {@link resolveDeviceInputs} does for that Input. A scope that
 * points at a missing Device falls back to the Project base.
 */
export function resolveScopeStyle(
  project: Project,
  scope: StyleScope,
): GlyphStyle {
  const base = projectBaseStyle(project);
  if (scope.tier === "project") return base;

  const device = project.devices[scope.deviceIndex];
  if (!device) return base;
  if (scope.tier === "device") return resolveStyle(base, device.style);

  const catalog = getCatalog(device.catalogId);
  const defaultStyle = catalog
    ? catalogIndex(catalog).get(scope.glyphId)?.defaultStyle
    : undefined;
  return resolveStyle(
    base,
    device.style,
    defaultStyle,
    device.glyphStyles[scope.glyphId],
  );
}

/**
 * Resolve a Device's generated Inputs (ADR-0005): the enabled Catalog entries,
 * in order, then the custom Inputs. Each Input's effective style is resolved
 * through the four-tier Style Cascade — Project → Device → Catalog per-Input
 * default → Glyph (ADR-0006) — so callers get ready-to-draw {@link GlyphStyle}s.
 *
 * Shared by generation and the live preview so both go through the same cascade.
 */
export function resolveDeviceInputs(
  device: DeviceConfig,
  project: Project,
): ResolvedInput[] {
  const base = projectBaseStyle(project);
  const catalog = getCatalog(device.catalogId);
  const byId = catalog ? catalogIndex(catalog) : null;
  const resolved: ResolvedInput[] = [];

  for (const id of device.enabled) {
    const entry = byId?.get(id);
    // An enabled id with no Catalog entry (stale save) is skipped, not drawn.
    if (!entry) continue;
    resolved.push({
      id,
      label: entry.label,
      symbolId: entry.symbolId,
      style: resolveStyle(
        base,
        device.style,
        entry.defaultStyle,
        device.glyphStyles[id],
      ),
    });
  }

  for (const { id, label } of device.custom) {
    resolved.push({
      id,
      label,
      // Custom Inputs have no Catalog per-Input default tier.
      style: resolveStyle(
        base,
        device.style,
        undefined,
        device.glyphStyles[id],
      ),
    });
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
  const { cellSize } = project;
  const inputs = resolveDeviceInputs(device, project);
  const { atlasSize, placements } = gridPack(inputs.length, cellSize);

  const deviceSlug = slugify(device.name);
  const used = new Set<string>();

  const glyphPlacements: GlyphPlacement[] = placements.map(
    ({ index, rect }) => {
      const { label, style, symbolId } = inputs[index];
      const spriteName = uniqueName(
        applyTemplate(
          project.naming.template,
          {
            device: deviceSlug,
            input: slugify(label),
            index: String(index),
          },
          project.naming.case,
        ),
        used,
        project.naming.case,
      );
      return { label, spriteName, rect, style, symbolId };
    },
  );

  const filename = applyTemplate(
    project.filenameTemplate,
    { device: deviceSlug, input: "", index: "" },
    project.naming.case,
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

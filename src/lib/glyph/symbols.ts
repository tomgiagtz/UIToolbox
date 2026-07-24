/**
 * Shipped **Symbols** and **Authored Backgrounds** (ADR-0004, issue #14).
 *
 * A Symbol is a bundled SVG Render Source for a well-known Input; an Authored
 * Background is a shipped tile shape (bumper/trigger). Both are authored as cells
 * in the per-device `symbols/*-symbols.svg` atlases and windowed into standalone
 * square-viewBox SVGs by `npm run symbols` (see `symbols/README.md`). This module
 * is the typed accessor over that generated output — the app and tests import
 * here, never the atlases or the codegen.
 */
import {
  SYMBOL_ASSETS,
  SYMBOL_SVGS,
} from "@/lib/glyph/symbols/symbols.generated";

/** One shipped asset's manifest entry. */
export interface SymbolAsset {
  /** Stable id, matched to a Catalog Input's `symbolId` / Background source. */
  id: string;
  /** Default label for the gallery / picker (the Input carries its own label). */
  label: string;
  /**
   * Foreground Render Source (`symbol`) vs. background tile (`background`).
   * Symbols carry their authored colours as tool-configurable defaults (face
   * buttons default to the Xbox brand palette); backgrounds are tinted by the
   * Style Cascade fill.
   */
  kind: "symbol" | "background";
  /** Source assets: which `<atlas>-symbols.svg` authors this asset's cell. */
  atlas?: string;
  /** Derived assets: the source id whose art is rotated to make this one. */
  rotateOf?: string;
  /** Derived assets: clockwise rotation in degrees (90 | 180 | 270). */
  rotate?: number;
}

export { SYMBOL_ASSETS };

const byId = new Map(SYMBOL_ASSETS.map((a) => [a.id, a]));

/** The manifest entry for an asset id, or `undefined`. */
export function getSymbolAsset(id: string): SymbolAsset | undefined {
  return byId.get(id);
}

/**
 * Resolve an asset id to its SVG within `svgs`, honouring the shared→device
 * cascade: a `<device>:<id>` override wins over the shared base, and a device with
 * no override falls back to it. Pure over its map argument so it's unit-testable.
 */
export function resolveSymbolSvg(
  svgs: Record<string, string>,
  id: string,
  device?: string,
): string | undefined {
  if (device && svgs[`${device}:${id}`]) return svgs[`${device}:${id}`];
  return svgs[id];
}

/**
 * The standalone SVG markup for an asset id on an optional Device, or `undefined`
 * if not yet authored. Pass the Device's Catalog id to pick up its override of a
 * shared asset (e.g. a PlayStation-specific `dpad-up`).
 */
export function getSymbolSvg(id: string, device?: string): string | undefined {
  return resolveSymbolSvg(SYMBOL_SVGS, id, device);
}

/** Every foreground Symbol (excludes Authored Backgrounds). */
export const SYMBOLS: SymbolAsset[] = SYMBOL_ASSETS.filter(
  (a) => a.kind === "symbol",
);

/** Every Authored Background tile. */
export const AUTHORED_BACKGROUNDS: SymbolAsset[] = SYMBOL_ASSETS.filter(
  (a) => a.kind === "background",
);

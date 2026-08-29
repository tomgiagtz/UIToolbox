/**
 * Which Symbols the project is actually drawing, and which Inputs an imported
 * cell could be bound to (#39).
 *
 * The Symbol peer of `image-refs.ts`, and deliberately shallower than it. An
 * image can be referenced from two places at any cascade tier, so finding its
 * references means a bespoke walk; a Glyph's Symbol id, whether it came from the
 * Catalog or from a pin (ADR-0015 §7), falls out of resolving the Glyph — so the
 * walk is already written. {@link resolveDeviceInputs} resolves each Glyph
 * exactly as the exporter does, which is what keeps "in use" meaning the same
 * thing here and on the canvas: a pinned Symbol counts as a use, so a refresh
 * that drops the cell behind one is reported rather than silently blanking it.
 */
import { getCatalog, type CatalogInput } from "@/lib/glyph/catalog";
import { resolveDeviceInputs } from "@/lib/glyph/generate";
import type { SymbolUse } from "@/lib/glyph/symbols/set-import";
import type { Project } from "@/lib/glyph/types";

/**
 * One entry per Glyph currently drawing a Symbol, so a count means Glyphs and
 * not distinct ids — which is what a refresh warning has to say (rule 5).
 */
export function symbolUses(project: Project): SymbolUse[] {
  const uses: SymbolUse[] = [];
  for (const device of project.devices)
    for (const input of resolveDeviceInputs(device, project))
      if (input.symbolId) uses.push({ symbolId: input.symbolId });
  return uses;
}

/**
 * Every Catalog Input the project's Devices offer, for matching a cell id
 * against on import.
 *
 * Only the Catalogs in play, rather than all of them: a cell binds so the
 * importer can be shown where their art will land, and an Input on a Device the
 * project doesn't have is not somewhere it lands. A cell matching nothing is not
 * an error — the Catalog extends rather than being a ceiling — so the cost of
 * missing a match is a title-cased label, not a rejection.
 */
export function projectCatalogInputs(project: Project): CatalogInput[] {
  const seen = new Set<string>();
  const inputs: CatalogInput[] = [];
  for (const device of project.devices) {
    const catalog = getCatalog(device.catalogId);
    for (const input of catalog?.inputs ?? []) {
      if (seen.has(input.id)) continue;
      seen.add(input.id);
      inputs.push(input);
    }
  }
  return inputs;
}

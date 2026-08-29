/**
 * The runtime registry of **imported Symbol Set** art (#39).
 *
 * The draw path reaches art through `getSymbolSvg(id, device)`, a module-level
 * lookup over the shipped atlases, and it is reached from the compositor, the
 * live preview, the Device Layout and the exporter alike. An imported Set is
 * per-project, so something has to bridge the two — this module, which the
 * editor keeps in step with `project.sets` exactly as `images.ts` is kept in
 * step with `project.images`.
 *
 * The bridge is a registry rather than a project argument threaded through every
 * call site because the call sites are the whole draw path, and an id that
 * resolves differently depending on which function you asked is worse than a
 * module-level map (ADR-0015).
 *
 * **A loaded project owns its Set art outright**, the rule ADR-0011 set for
 * images: {@link registerSets} replaces the registry wholesale rather than
 * merging, so art from a project you closed can never be drawn by the one you
 * opened. Wrong art is worse than no art.
 */
import type { SetCell, SymbolSet } from "@/lib/glyph/types";

/** Cell id → the cell, across every imported Set in the open project. */
const cells = new Map<string, SetCell>();

/**
 * What is registered right now, as one string.
 *
 * Registration runs on every render that produces a new `sets` array, which is
 * every project load — including the ones that change no art at all. Comparing
 * signatures makes a no-change registration cost nothing, and that matters more
 * than it sounds: notifying anyway would clear the bitmap cache under art whose
 * appearance key hasn't moved, and the draw path only re-warms when that key
 * changes. The Glyph would fall back to its label and stay there.
 */
let signature = JSON.stringify([]);

/** Bumped only when the registered art actually differs (see {@link signature}). */
let version = 0;

const listeners = new Set<() => void>();

/**
 * Be told when the registered art changes.
 *
 * Two callers, for two different needs: `symbol-render.ts` drops its bitmap
 * cache, and the draw path re-keys its warming pass off {@link getSetArtVersion}
 * so the bitmaps it just dropped are asked for again. The dependency runs this
 * way — listeners registering *into* here — because `getSymbolSvg` consults this
 * module, so this module may not reach back into the draw path.
 *
 * @returns an unsubscribe function.
 */
export function onSetArtChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * A number that changes whenever the registered art does.
 *
 * Cache keys carry an id, not the drawing behind it, so a Set arriving or
 * leaving changes what an unchanged key means. This is what lets a key say so.
 */
export function getSetArtVersion(): number {
  return version;
}

/**
 * Swap in `next`, telling the listeners only if the art really moved.
 *
 * The signature is computed here rather than passed in, so "no Sets" has one
 * spelling however it was arrived at — clearing and registering an empty list
 * are the same state, and a listener that heard about the difference between
 * them would be hearing about nothing.
 */
function commit(next: Map<string, SetCell>): void {
  const nextSignature = JSON.stringify(
    // The art is the only thing that changes a drawing. A label edit moves a row
    // in the Assets window and nothing on the canvas, so it must not invalidate.
    [...next].map(([id, cell]) => [id, cell.svg]),
  );
  if (nextSignature === signature) return;
  cells.clear();
  for (const [id, cell] of next) cells.set(id, cell);
  signature = nextSignature;
  version += 1;
  for (const listener of listeners) listener();
}

/**
 * Replace the registered Set art with what these Sets draw.
 *
 * Later Sets win a clash, which is the same rule the UI shows: a Set imported
 * over one that draws the same id replaces that art. Nothing merges — a cell id
 * resolves to exactly one drawing.
 */
export function registerSets(sets: SymbolSet[]): void {
  const next = new Map<string, SetCell>();
  for (const set of sets) for (const cell of set.cells) next.set(cell.id, cell);
  commit(next);
}

/** Forget every imported cell — closing a project, or loading one with no Sets. */
export function clearSets(): void {
  commit(new Map());
}

/** The imported cell for an id, or `undefined` if no Set draws it. */
export function getSetCell(id: string): SetCell | undefined {
  return cells.get(id);
}

/**
 * The imported SVG for a cell id, or `undefined`.
 *
 * Not scoped to a Device. A shipped id is bare and the *atlas file* scopes it,
 * but an imported Set is a project-level shipment with no Device to belong to —
 * so a cell the user drew answers for that id on every Device, and wins over
 * shipped art of the same name. That is the point of importing: if you drew an
 * `a`, you meant yours.
 */
export function getSetSvg(id: string): string | undefined {
  return cells.get(id)?.svg;
}

/** Every imported cell id, for the pickers that list what a project can draw. */
export function importedCellIds(): string[] {
  return [...cells.keys()];
}

/**
 * Importing a **Symbol Set** (#39, ADR-0007 §4): the pure half.
 *
 * A Set is one authored SVG whose `<g id>` cells are the Symbols and Authored
 * Backgrounds a project can draw with. Importing one means four steps —
 * **measure**, **window**, **bind**, **reconcile** — and only the first needs a
 * browser. So measurement is a *port*: `measure-atlas.ts` hands this module an
 * already-measured atlas and everything after that is pure and testable in node.
 *
 * That is the same split the shipped pipeline already has. `build-symbols.mjs`
 * measures with jsdom plus ~150 lines of hand-rolled bounding-box maths, needed
 * only because jsdom has no layout; a browser gets the same numbers from one
 * `getBBox()` call. The prototype on `proto/38-symbol-set-import` confirmed the
 * two agree exactly on every `xbox-symbols.svg` viewBox, which is why none of
 * that maths is reimplemented here.
 *
 * ## The rules a refresh obeys
 *
 * These were settled in the prototype and are the load-bearing part of the
 * module; {@link buildReview} implements them.
 *
 * 1. **Art always comes from the file.** The file is the drawing; the project
 *    never edits it.
 * 2. **A typed label survives a refresh.** A label nobody touched re-derives
 *    from the Catalog, so fixing a Catalog label fixes every Set that binds to
 *    it.
 * 3. **Role colours are project config**, and a refresh never touches them
 *    (ADR-0014 §4).
 * 4. **The Set is exactly what the file draws.** A cell the file stops drawing
 *    is removed, whether or not a Glyph is using it, and there is deliberately
 *    no control to drop a single cell by hand. Both halves of that serve one
 *    end: the Set can never drift from the atlas it came from.
 * 5. **What a refresh may not do is take art away quietly.** Every Glyph left
 *    without art is warned about *by id* — the id is the whole point, since it
 *    is what the author has to put back in the drawing — before accepting and
 *    after. The Glyph keeps its Symbol id and draws its label meanwhile, so
 *    restoring the drawing restores the Glyph with no manual repair.
 * 6. **A name is an identity.** A rename is indistinguishable from a delete plus
 *    an add, so the tool says exactly that rather than guessing which pair of
 *    ids was really one cell.
 */
import type { CatalogInput } from "@/lib/glyph/catalog";
import { PAINT_ROLES, inspectPaint } from "@/lib/glyph/symbols/paint-roles.mjs";
import type {
  PaintFlag,
  PaintRole,
  SetCell,
  SymbolSet,
} from "@/lib/glyph/types";

// --- The measurement port --------------------------------------------------

/** One paint the measurer found on a shape, before it is classified. */
export interface MeasuredPaint {
  /** The shape's own id, or its tag name — only ever shown in a flag. */
  shape: string;
  prop: "fill" | "stroke";
  value: string;
}

/**
 * One `<g id>` cell as the browser measured it: its bounds **in the root SVG's
 * coordinate system**, its markup, and every paint it draws with.
 *
 * "Candidate" rather than "cell" because measuring cannot tell art from a frame
 * rect or a guide layer — {@link windowCell} is what decides, and it says why.
 */
export interface MeasuredCandidate {
  id: string;
  /** Serialized markup, kept verbatim so the art is never re-authored. */
  markup: string;
  bbox: { x: number; y: number; width: number; height: number };
  paints: MeasuredPaint[];
}

/** A whole atlas, measured: its grid size and every id'd candidate in it. */
export interface MeasuredAtlas {
  cellSize: number;
  candidates: MeasuredCandidate[];
}

// --- Windowing -------------------------------------------------------------

/** A cell cut out of the atlas: the art, where it sat, and what it paints with. */
export interface WindowedCell {
  id: string;
  col: number;
  row: number;
  /** Which roles the cell actually uses, in canonical palette order. */
  roles: PaintRole[];
  flags: PaintFlag[];
  /** Standalone square-viewBox SVG, still painted in sentinels. */
  svg: string;
}

/** A candidate that isn't a Symbol, and the reason — never a silent drop. */
export interface SkippedCandidate {
  id: string;
  reason: string;
}

/** Everything one atlas yielded: its cells, its rejects, and its id collisions. */
export interface WindowedAtlas {
  cells: WindowedCell[];
  skipped: SkippedCandidate[];
  /** Ids drawn more than once. The first wins; the rest are named, not merged. */
  duplicates: string[];
}

const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg"';

/**
 * Turn one measured candidate into a windowed cell, or into the reason it isn't
 * a Symbol at all.
 *
 * The author draws each picture wherever they like on a square grid, so the cell
 * is found rather than declared: take the grid square the bounding box's
 * **centre** falls in and cut the window to that square, leaving the art at the
 * coordinates it was drawn at. Centre rather than origin so art that overhangs
 * its square slightly still lands in the square it looks like it is in.
 *
 * With no manifest to cross-check against — the whole point of an imported Set
 * is that the ids are the author's, not ours — the import has to decide for
 * itself what is *not* art. Three rejections, each stated: nothing drawn, bigger
 * than one grid square (a frame rect or a guide layer), or drawing no visible
 * paint at all.
 */
export function windowCell(
  measured: MeasuredCandidate,
  cellSize: number,
):
  | { kind: "cell"; cell: WindowedCell }
  | { kind: "skip"; skipped: SkippedCandidate } {
  const skip = (reason: string) =>
    ({ kind: "skip", skipped: { id: measured.id, reason } }) as const;

  const { bbox } = measured;
  if (bbox.width === 0 && bbox.height === 0) return skip("nothing drawn yet");
  if (bbox.width > cellSize || bbox.height > cellSize)
    return skip(
      `too big for one grid square (${Math.round(bbox.width)}×${Math.round(
        bbox.height,
      )}) — a frame or a guide layer, not a symbol`,
    );

  const { roles, flags } = inspectCellPaints(measured.paints);
  if (!roles.length && !flags.length) return skip("draws nothing visible");

  const x0 = Math.floor((bbox.x + bbox.width / 2) / cellSize) * cellSize;
  const y0 = Math.floor((bbox.y + bbox.height / 2) / cellSize) * cellSize;
  return {
    kind: "cell",
    cell: {
      id: measured.id,
      col: x0 / cellSize,
      row: y0 / cellSize,
      roles,
      flags,
      svg: `${SVG_OPEN} viewBox="${x0} ${y0} ${cellSize} ${cellSize}">${measured.markup}</svg>`,
    },
  };
}

/** Which roles a cell actually uses, and every paint that isn't a role. */
export function inspectCellPaints(paints: MeasuredPaint[]): {
  roles: PaintRole[];
  flags: PaintFlag[];
} {
  const used = new Set<PaintRole>();
  const flags: PaintFlag[] = [];
  for (const paint of paints) {
    const result = inspectPaint(paint.value);
    if (result.kind === "role") used.add(result.role);
    else if (result.kind === "unknown")
      flags.push({ shape: paint.shape, prop: paint.prop, value: result.value });
  }
  // Canonical palette order rather than encounter order, so two exports of the
  // same drawing list their roles the same way and a review row is stable.
  return { roles: PAINT_ROLES.filter((role) => used.has(role)), flags };
}

/**
 * Window a whole measured atlas, in reading order.
 *
 * A repeated id is a **duplicate**, not a merge: two cells claiming one name is
 * an authoring mistake with no right answer, so the first drawing wins and the
 * rest are named for the author to fix.
 */
export function windowAtlas(atlas: MeasuredAtlas): WindowedAtlas {
  const cells: WindowedCell[] = [];
  const skipped: SkippedCandidate[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  for (const candidate of atlas.candidates) {
    if (seen.has(candidate.id)) {
      duplicates.push(candidate.id);
      continue;
    }
    seen.add(candidate.id);
    const out = windowCell(candidate, atlas.cellSize);
    if (out.kind === "cell") cells.push(out.cell);
    else skipped.push(out.skipped);
  }

  cells.sort((a, b) => a.row - b.row || a.col - b.col);
  return { cells, skipped, duplicates };
}

// --- Binding ---------------------------------------------------------------

/**
 * What a cell's id turned out to mean: art the Catalog already knows a home for,
 * or a name it has never heard of.
 *
 * A name the Catalog doesn't know is **not an error** — the Catalog extends
 * rather than being a ceiling, which is the point of letting anyone author a
 * Set. One name can also answer for several Inputs, since both bumpers share one
 * drawing.
 */
export interface CellBinding {
  kind: "catalog" | "custom";
  /** Catalog Input ids this art depicts; empty for a custom cell. */
  inputs: string[];
  /** The label to show for the cell before anyone types one. */
  label: string;
}

/** `dpad-right` → `Dpad Right`: the readable fallback for an unknown id. */
export function titleCaseId(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Match one cell id against a Catalog. The Catalog's own label is preferred
 * where exactly one Input claims the art; where several do, no one Input's label
 * is the art's name, so the id is title-cased instead.
 */
export function bindCell(cellId: string, catalog: CatalogInput[]): CellBinding {
  const inputs = catalog.filter((input) => input.symbolId === cellId);
  if (!inputs.length)
    return { kind: "custom", inputs: [], label: titleCaseId(cellId) };
  return {
    kind: "catalog",
    inputs: inputs.map((input) => input.id),
    label: inputs.length === 1 ? inputs[0].label : titleCaseId(cellId),
  };
}

// --- Reconciliation --------------------------------------------------------

/** What happened to one cell between the installed Set and the file just read. */
export type CellStatus = "new" | "unchanged" | "redrawn" | "gone";

/** One row of the import review: a cell, and what accepting would do to it. */
export interface ReviewEntry extends SetCell {
  status: CellStatus;
  binding: CellBinding;
}

/** An id a Glyph is drawing that the file no longer contains, and how many. */
export interface StrandedSymbol {
  id: string;
  glyphs: number;
}

/** A Glyph's claim on a Symbol id — all {@link buildReview} needs of a project. */
export interface SymbolUse {
  symbolId: string;
}

/** The pending draft an importer reviews before it becomes a {@link SymbolSet}. */
export interface SetReview {
  /** Cells in reading order, including the `gone` ones accepting would drop. */
  entries: ReviewEntry[];
  skipped: SkippedCandidate[];
  duplicates: string[];
  /** Rule 6: named as a possible rename, never resolved into one. */
  renameHint: string | null;
  /** Rule 5: art in use that this file stops providing. */
  stranded: StrandedSymbol[];
  /** Whether this reviews a re-read of an installed Set or a first import. */
  isRefresh: boolean;
}

/**
 * Compare a freshly windowed file against the Set already in the project, and
 * produce the draft an importer accepts or cancels.
 *
 * Pure and total: it decides nothing about the project, it only describes what
 * accepting would do. See the module header for the six rules it implements.
 */
export function buildReview(
  windowed: WindowedAtlas,
  catalog: CatalogInput[],
  installed: SymbolSet | null,
  uses: SymbolUse[],
): SetReview {
  const prior = installed?.cells ?? [];
  const priorById = new Map(prior.map((cell) => [cell.id, cell]));
  const entries: ReviewEntry[] = [];

  for (const cell of windowed.cells) {
    const was = priorById.get(cell.id);
    const binding = bindCell(cell.id, catalog);
    entries.push({
      ...cell,
      binding,
      // Rule 2: a typed label survives; an untouched one re-derives.
      label: was?.labelEdited ? was.label : binding.label,
      labelEdited: was?.labelEdited ?? false,
      status: !was ? "new" : was.svg === cell.svg ? "unchanged" : "redrawn",
    });
  }

  // Rule 4: what the file no longer draws leaves, whether or not a Glyph is
  // using it. Listed rather than dropped silently, so the review shows the loss
  // before it happens as well as after.
  for (const was of prior) {
    if (windowed.cells.some((cell) => cell.id === was.id)) continue;
    entries.push({
      ...was,
      status: "gone",
      binding: bindCell(was.id, catalog),
    });
  }

  // Rule 5: name every id a Glyph is drawing that this file no longer provides,
  // and how many Glyphs it costs.
  const drawn = new Set(windowed.cells.map((cell) => cell.id));
  const strandedUses = uses.filter((use) => !drawn.has(use.symbolId));
  const stranded = [...new Set(strandedUses.map((use) => use.symbolId))]
    // Only ids this Set was answering for. A Glyph pointing at shipped art, or
    // at a Symbol no Set ever drew, is not something this import took away.
    .filter((id) => priorById.has(id))
    .map((id) => ({
      id,
      glyphs: strandedUses.filter((use) => use.symbolId === id).length,
    }));

  return {
    entries: entries.sort(
      (a, b) => (a.row ?? 99) - (b.row ?? 99) || (a.col ?? 99) - (b.col ?? 99),
    ),
    skipped: windowed.skipped,
    duplicates: windowed.duplicates,
    renameHint: renameHint(entries),
    stranded,
    isRefresh: Boolean(installed),
  };
}

/**
 * Rule 6, made visible. A rename looks exactly like one id vanishing and another
 * appearing, and there is no honest way to tell the two apart — so the review
 * says so and lets the author decide, rather than pairing them up by guess and
 * silently carrying a typed label onto art that might be something else.
 */
function renameHint(entries: ReviewEntry[]): string | null {
  const added = entries.filter((entry) => entry.status === "new");
  const removed = entries.filter((entry) => entry.status === "gone");
  if (!added.length || !removed.length) return null;
  return (
    `${removed.map((entry) => entry.id).join(", ")} vanished and ` +
    `${added.map((entry) => entry.id).join(", ")} appeared. If that was a ` +
    `rename, anything you typed against the old name does not carry over.`
  );
}

/**
 * The warning that stands in for the art the import refuses to keep (rule 5).
 *
 * Names every missing id, because the id is what the author has to put back in
 * the drawing — or what the Glyph has to be re-pointed at.
 */
export function strandedWarning(stranded: StrandedSymbol[]): string {
  const names = stranded.map((s) => `“${s.id}”`).join(", ");
  const total = stranded.reduce((n, s) => n + s.glyphs, 0);
  const one = total === 1;
  return (
    `This file no longer draws ${names}, which ${
      one ? "1 Glyph was" : `${total} Glyphs were`
    } using. ${one ? "It now draws its label" : "They now draw their labels"} ` +
    `instead. Put ${stranded.length === 1 ? "it" : "them"} back in the drawing ` +
    `and refresh, or re-point the Glyph${one ? "" : "s"}.`
  );
}

/**
 * The Set a review becomes when it is accepted: the entries the file still
 * draws, keeping the role colours already configured (rule 3).
 *
 * `gone` entries are dropped here and nowhere else — the review carries them so
 * the loss can be shown, and accepting is the moment it is taken.
 */
export function acceptReview(
  review: SetReview,
  previous: SymbolSet | null,
  source: { id: string; name: string },
  defaultRoleColors: SymbolSet["roleColors"],
): SymbolSet {
  return {
    id: source.id,
    name: source.name,
    roleColors: previous?.roleColors ?? defaultRoleColors,
    // Spelled out rather than spread-minus-the-extras: a `SetCell` is what a
    // saved project carries, so the fields it holds should be a list you can
    // read here, not whatever a review row happens to have left over.
    cells: review.entries
      .filter((entry) => entry.status !== "gone")
      .map(({ id, label, labelEdited, col, row, roles, flags, svg }) => ({
        id,
        label,
        labelEdited,
        col,
        row,
        roles,
        flags,
        svg,
      })),
  };
}

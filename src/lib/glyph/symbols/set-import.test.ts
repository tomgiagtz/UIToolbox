import { describe, expect, it } from "vitest";
import type { CatalogInput } from "@/lib/glyph/catalog";
import {
  acceptReview,
  bindCell,
  buildReview,
  strandedWarning,
  windowAtlas,
  windowCell,
  type MeasuredAtlas,
  type MeasuredCandidate,
} from "@/lib/glyph/symbols/set-import";
import type { SymbolSet } from "@/lib/glyph/types";

/**
 * The rules in this module's header are the whole point of it — they decide what
 * happens to a project when an author re-exports their drawing, which is the one
 * moment an import can silently take art away. So they are pinned by name here.
 */

const CELL = 256;

const CATALOG: CatalogInput[] = [
  { id: "xbox-a", label: "A", symbolId: "a" },
  { id: "xbox-b", label: "B", symbolId: "b" },
  { id: "xbox-lb", label: "LB", symbolId: "bumper" },
  { id: "xbox-rb", label: "RB", symbolId: "bumper" },
];

/** A measured candidate sitting in one grid square, painted in sentinels. */
function candidate(
  id: string,
  col: number,
  row: number,
  overrides: Partial<MeasuredCandidate> = {},
): MeasuredCandidate {
  return {
    id,
    markup: `<g id="${id}"><circle/></g>`,
    bbox: { x: col * CELL + 40, y: row * CELL + 40, width: 176, height: 176 },
    paints: [
      { shape: "circle", prop: "fill", value: "#f00" },
      { shape: "circle", prop: "stroke", value: "#00f" },
    ],
    ...overrides,
  };
}

function atlas(...candidates: MeasuredCandidate[]): MeasuredAtlas {
  return { cellSize: CELL, candidates };
}

describe("windowCell", () => {
  it("cuts the window to the grid square the art's centre falls in", () => {
    const out = windowCell(candidate("b", 1, 2), CELL);
    expect(out.kind).toBe("cell");
    if (out.kind !== "cell") return;
    expect(out.cell).toMatchObject({ id: "b", col: 1, row: 2 });
    expect(out.cell.svg).toContain('viewBox="256 512 256 256"');
  });

  it("leaves the art at the coordinates it was drawn at", () => {
    const out = windowCell(candidate("a", 0, 0), CELL);
    if (out.kind !== "cell") throw new Error("expected a cell");
    expect(out.cell.svg).toContain('<g id="a"><circle/></g>');
  });

  it("keeps art that overhangs its square in the square it looks like", () => {
    // Centred in the second column, but starting slightly inside the first.
    const overhanging = candidate("wide", 1, 0, {
      bbox: { x: 250, y: 20, width: 216, height: 216 },
    });
    const out = windowCell(overhanging, CELL);
    if (out.kind !== "cell") throw new Error("expected a cell");
    expect(out.cell.col).toBe(1);
  });

  it("reports roles in canonical palette order, not encounter order", () => {
    const out = windowCell(
      candidate("a", 0, 0, {
        paints: [
          { shape: "path", prop: "fill", value: "#0f0" },
          { shape: "path", prop: "stroke", value: "#00f" },
          { shape: "circle", prop: "fill", value: "#f00" },
        ],
      }),
      CELL,
    );
    if (out.kind !== "cell") throw new Error("expected a cell");
    expect(out.cell.roles).toEqual(["fill", "border", "secondary"]);
  });

  it("flags a visible non-sentinel paint rather than dropping it", () => {
    const out = windowCell(
      candidate("a", 0, 0, {
        paints: [{ shape: "circle", prop: "fill", value: "#fe0000" }],
      }),
      CELL,
    );
    if (out.kind !== "cell") throw new Error("expected a cell");
    expect(out.cell.flags).toEqual([
      { shape: "circle", prop: "fill", value: "#fe0000" },
    ]);
    // Flagged, but still art: a mis-exported red is a cell you can fix, not a
    // cell the import refuses.
    expect(out.cell.roles).toEqual([]);
  });

  describe("skipping — every rejection states its reason", () => {
    it("skips an empty group", () => {
      const out = windowCell(
        candidate("empty", 0, 0, {
          bbox: { x: 0, y: 0, width: 0, height: 0 },
        }),
        CELL,
      );
      expect(out).toMatchObject({ kind: "skip" });
      if (out.kind !== "skip") return;
      expect(out.skipped.reason).toBe("nothing drawn yet");
    });

    it("skips the atlas frame rect, naming its size", () => {
      const out = windowCell(
        candidate("frame", 0, 0, {
          bbox: { x: 0, y: 0, width: 1024, height: 768 },
        }),
        CELL,
      );
      if (out.kind !== "skip") throw new Error("expected a skip");
      expect(out.skipped.reason).toContain("1024×768");
      expect(out.skipped.reason).toContain("not a symbol");
    });

    it("skips a guide layer that draws no visible paint", () => {
      const out = windowCell(
        candidate("guides", 0, 0, {
          paints: [{ shape: "rect", prop: "fill", value: "none" }],
        }),
        CELL,
      );
      if (out.kind !== "skip") throw new Error("expected a skip");
      expect(out.skipped.reason).toBe("draws nothing visible");
    });
  });
});

describe("windowAtlas", () => {
  it("returns cells in reading order regardless of document order", () => {
    const windowed = windowAtlas(
      atlas(candidate("c", 0, 1), candidate("b", 1, 0), candidate("a", 0, 0)),
    );
    expect(windowed.cells.map((cell) => cell.id)).toEqual(["a", "b", "c"]);
  });

  it("names a repeated id rather than merging the two drawings", () => {
    const windowed = windowAtlas(
      atlas(candidate("a", 0, 0), candidate("a", 1, 0)),
    );
    expect(windowed.duplicates).toEqual(["a"]);
    // First drawing wins; the second is reported, not silently applied.
    expect(windowed.cells).toHaveLength(1);
    expect(windowed.cells[0].col).toBe(0);
  });

  it("carries every skipped candidate out with the cells", () => {
    const windowed = windowAtlas(
      atlas(
        candidate("frame", 0, 0, {
          bbox: { x: 0, y: 0, width: 1024, height: 768 },
        }),
        candidate("a", 0, 0),
      ),
    );
    expect(windowed.cells.map((c) => c.id)).toEqual(["a"]);
    expect(windowed.skipped.map((s) => s.id)).toEqual(["frame"]);
  });
});

describe("bindCell", () => {
  it("takes the Catalog Input's label when exactly one claims the art", () => {
    expect(bindCell("a", CATALOG)).toEqual({
      kind: "catalog",
      inputs: ["xbox-a"],
      label: "A",
    });
  });

  it("title-cases the id when several Inputs share one drawing", () => {
    // Neither LB nor RB is the *name* of the art both are drawn with.
    expect(bindCell("bumper", CATALOG)).toEqual({
      kind: "catalog",
      inputs: ["xbox-lb", "xbox-rb"],
      label: "Bumper",
    });
  });

  it("makes an id the Catalog has never heard of a custom cell, not an error", () => {
    expect(bindCell("paddle-left", CATALOG)).toEqual({
      kind: "custom",
      inputs: [],
      label: "Paddle Left",
    });
  });
});

describe("buildReview — a first import", () => {
  it("marks every cell new and knows it is not a refresh", () => {
    const review = buildReview(
      windowAtlas(atlas(candidate("a", 0, 0), candidate("b", 1, 0))),
      CATALOG,
      null,
      [],
    );
    expect(review.isRefresh).toBe(false);
    expect(review.entries.map((e) => [e.id, e.status])).toEqual([
      ["a", "new"],
      ["b", "new"],
    ]);
    expect(review.stranded).toEqual([]);
    // Nothing was removed, so a rename is not a possible reading.
    expect(review.renameHint).toBeNull();
  });

  it("labels each cell from the Catalog binding", () => {
    const review = buildReview(
      windowAtlas(atlas(candidate("bumper", 0, 0), candidate("mystery", 1, 0))),
      CATALOG,
      null,
      [],
    );
    expect(review.entries.map((e) => e.label)).toEqual(["Bumper", "Mystery"]);
    expect(review.entries.every((e) => e.labelEdited)).toBe(false);
  });
});

/** The Set already in the project, as it would have been accepted. */
function installed(...ids: string[]): SymbolSet {
  const review = buildReview(
    windowAtlas(atlas(...ids.map((id, i) => candidate(id, i, 0)))),
    CATALOG,
    null,
    [],
  );
  return acceptReview(
    review,
    null,
    { id: "set-1", name: "mypad.svg" },
    {
      fill: "#2f9e44",
      border: "#111111",
      secondary: "#ffffff",
    },
  );
}

describe("buildReview — a refresh", () => {
  it("rule 1: art always comes from the file", () => {
    const before = installed("a");
    const redrawn = candidate("a", 0, 0, {
      markup: '<g id="a"><path d="M0 0"/></g>',
    });
    const review = buildReview(
      windowAtlas(atlas(redrawn)),
      CATALOG,
      before,
      [],
    );
    expect(review.entries[0].status).toBe("redrawn");
    expect(review.entries[0].svg).toContain('<path d="M0 0"/>');
  });

  it("calls a byte-identical cell unchanged", () => {
    const before = installed("a");
    const review = buildReview(
      windowAtlas(atlas(candidate("a", 0, 0))),
      CATALOG,
      before,
      [],
    );
    expect(review.entries[0].status).toBe("unchanged");
  });

  it("rule 2: a typed label survives, an untouched one re-derives", () => {
    const before = installed("a", "b");
    before.cells[0] = { ...before.cells[0], label: "Jump", labelEdited: true };

    const review = buildReview(
      windowAtlas(atlas(candidate("a", 0, 0), candidate("b", 1, 0))),
      // The Catalog has changed its mind about what B is called.
      [
        ...CATALOG.slice(0, 1),
        { id: "xbox-b", label: "Circle", symbolId: "b" },
      ],
      before,
      [],
    );
    expect(review.entries.map((e) => e.label)).toEqual(["Jump", "Circle"]);
    expect(review.entries.map((e) => e.labelEdited)).toEqual([true, false]);
  });

  it("rule 4: a cell the file stops drawing goes, even when a Glyph uses it", () => {
    const before = installed("a", "b");
    const review = buildReview(
      windowAtlas(atlas(candidate("a", 0, 0))),
      CATALOG,
      before,
      [{ symbolId: "b" }],
    );
    expect(review.entries.map((e) => [e.id, e.status])).toEqual([
      ["a", "unchanged"],
      ["b", "gone"],
    ]);
    // The review still carries it, so the loss is shown before it is taken.
    expect(
      acceptReview(
        review,
        before,
        { id: "set-1", name: "mypad.svg" },
        before.roleColors,
      ).cells.map((c) => c.id),
    ).toEqual(["a"]);
  });

  it("rule 5: art in use that vanishes is named by id, with a count", () => {
    const before = installed("a", "b");
    const review = buildReview(
      windowAtlas(atlas(candidate("a", 0, 0))),
      CATALOG,
      before,
      [{ symbolId: "b" }, { symbolId: "b" }, { symbolId: "a" }],
    );
    expect(review.stranded).toEqual([{ id: "b", glyphs: 2 }]);
    expect(strandedWarning(review.stranded)).toContain("“b”");
    expect(strandedWarning(review.stranded)).toContain("2 Glyphs were");
  });

  it("does not blame this Set for a Glyph drawing art it never provided", () => {
    const before = installed("a");
    const review = buildReview(
      windowAtlas(atlas(candidate("a", 0, 0))),
      CATALOG,
      before,
      // Shipped art, or a Symbol no Set ever drew. Not this import's doing.
      [{ symbolId: "dpad-right" }],
    );
    expect(review.stranded).toEqual([]);
  });

  it("rule 6: a rename is reported as a delete plus an add, never resolved", () => {
    const before = installed("paddle-left");
    const review = buildReview(
      windowAtlas(atlas(candidate("paddle-l", 0, 0))),
      CATALOG,
      before,
      [],
    );
    expect(review.renameHint).toContain("paddle-left");
    expect(review.renameHint).toContain("paddle-l");
    expect(review.renameHint).toContain("does not carry over");
  });
});

describe("acceptReview", () => {
  it("rule 3: keeps the role colours already configured", () => {
    const before = installed("a");
    const configured = {
      ...before,
      roleColors: { fill: "#123456", border: "#000000", secondary: "#ffffff" },
    };
    const review = buildReview(
      windowAtlas(atlas(candidate("a", 0, 0))),
      CATALOG,
      configured,
      [],
    );
    const accepted = acceptReview(
      review,
      configured,
      { id: "set-1", name: "mypad.svg" },
      { fill: "#2f9e44", border: "#111111", secondary: "#ffffff" },
    );
    expect(accepted.roleColors).toEqual(configured.roleColors);
  });

  it("stores no Catalog binding, which is the Catalog's to re-derive", () => {
    const before = installed("a");
    expect(before.cells[0]).not.toHaveProperty("binding");
    expect(before.cells[0]).not.toHaveProperty("status");
  });
});

describe("strandedWarning", () => {
  it("reads as one Glyph when only one is affected", () => {
    const warning = strandedWarning([{ id: "b", glyphs: 1 }]);
    expect(warning).toContain("1 Glyph was");
    expect(warning).toContain("It now draws its label");
    expect(warning).toContain("re-point the Glyph.");
  });
});

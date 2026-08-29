import { afterEach, describe, expect, it } from "vitest";
import { getSymbolSvg } from "@/lib/glyph/symbols";
import {
  clearSets,
  getSetArtVersion,
  getSetCell,
  getSetSvg,
  importedCellIds,
  onSetArtChange,
  registerSets,
} from "@/lib/glyph/symbols/set-art";
import type { SymbolSet } from "@/lib/glyph/types";

/**
 * This registry decides what a Symbol id *draws*, which is the one thing an
 * import can get wrong in a way nothing reports — a Glyph showing art the
 * project never contained looks exactly like a Glyph showing the right art
 * (ADR-0011). So the precedence and the replace-outright rule are pinned here.
 */

function set(id: string, cells: Record<string, string>): SymbolSet {
  return {
    id,
    name: `${id}.svg`,
    roleColors: { fill: "#2f9e44", border: "#111111", secondary: "#ffffff" },
    cells: Object.entries(cells).map(([cellId, svg], i) => ({
      id: cellId,
      label: cellId,
      labelEdited: false,
      col: i,
      row: 0,
      roles: ["fill" as const],
      flags: [],
      svg,
    })),
  };
}

afterEach(() => clearSets());

describe("the imported Set art registry", () => {
  it("resolves a cell by id", () => {
    registerSets([set("mypad", { paddle: "<svg id='mine'/>" })]);
    expect(getSetSvg("paddle")).toBe("<svg id='mine'/>");
    expect(getSetCell("paddle")?.label).toBe("paddle");
    expect(importedCellIds()).toEqual(["paddle"]);
  });

  it("knows nothing about ids no Set draws", () => {
    registerSets([set("mypad", { paddle: "<svg/>" })]);
    expect(getSetSvg("nope")).toBeUndefined();
  });

  it("replaces outright rather than merging, so a closed project's art cannot draw", () => {
    registerSets([set("first", { a: "<svg id='first'/>" })]);
    registerSets([set("second", { b: "<svg id='second'/>" })]);
    expect(getSetSvg("a")).toBeUndefined();
    expect(getSetSvg("b")).toBe("<svg id='second'/>");
  });

  it("lets a later Set win a clash, the way the window shows it", () => {
    registerSets([
      set("first", { a: "<svg id='first'/>" }),
      set("second", { a: "<svg id='second'/>" }),
    ]);
    expect(getSetSvg("a")).toBe("<svg id='second'/>");
  });
});

describe("imported art against shipped art (ADR-0015 §4)", () => {
  it("wins for the same id, on every Device", () => {
    // `a` is drawn by the shipped Xbox atlas.
    expect(getSymbolSvg("a", "xbox")).toBeDefined();
    registerSets([set("mypad", { a: "<svg id='mine'/>" })]);
    expect(getSymbolSvg("a", "xbox")).toBe("<svg id='mine'/>");
    // No Device to belong to: an imported Set is a project-level shipment.
    expect(getSymbolSvg("a")).toBe("<svg id='mine'/>");
    expect(getSymbolSvg("a", "playstation")).toBe("<svg id='mine'/>");
  });

  it("leaves shipped art alone for ids no Set draws", () => {
    const shipped = getSymbolSvg("a", "xbox");
    registerSets([set("mypad", { paddle: "<svg id='mine'/>" })]);
    expect(getSymbolSvg("a", "xbox")).toBe(shipped);
  });

  it("gives the shipped drawing back when the Set is removed", () => {
    const shipped = getSymbolSvg("a", "xbox");
    registerSets([set("mypad", { a: "<svg id='mine'/>" })]);
    clearSets();
    expect(getSymbolSvg("a", "xbox")).toBe(shipped);
  });
});

describe("change notification (ADR-0015 §4)", () => {
  it("says nothing when the registered art is unchanged", () => {
    // The regression this exists for: every project load hands over a fresh
    // `sets` array, and notifying anyway would drop bitmaps whose appearance
    // key hasn't moved — leaving the Glyph on its label with nothing to
    // re-warm it.
    const seen: number[] = [];
    const off = onSetArtChange(() => seen.push(getSetArtVersion()));
    registerSets([]);
    registerSets([]);
    expect(seen).toEqual([]);

    const mypad = set("mypad", { a: "<svg id='mine'/>" });
    registerSets([mypad]);
    registerSets([structuredClone(mypad)]);
    expect(seen).toHaveLength(1);
    off();
  });

  it("says nothing when only a label changed, which draws nothing", () => {
    const mypad = set("mypad", { a: "<svg id='mine'/>" });
    registerSets([mypad]);
    let fired = 0;
    const off = onSetArtChange(() => fired++);
    registerSets([{ ...mypad, cells: [{ ...mypad.cells[0], label: "Jump" }] }]);
    expect(fired).toBe(0);
    off();
  });

  it("fires, with a new version, when the art actually differs", () => {
    registerSets([set("mypad", { a: "<svg id='one'/>" })]);
    const before = getSetArtVersion();
    let fired = 0;
    const off = onSetArtChange(() => fired++);
    registerSets([set("mypad", { a: "<svg id='two'/>" })]);
    expect(fired).toBe(1);
    expect(getSetArtVersion()).toBeGreaterThan(before);
    off();
  });

  it("stops calling a listener that unsubscribed", () => {
    let fired = 0;
    onSetArtChange(() => fired++)();
    registerSets([set("mypad", { a: "<svg id='mine'/>" })]);
    expect(fired).toBe(0);
  });
});

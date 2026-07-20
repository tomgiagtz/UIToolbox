import { describe, expect, it } from "vitest";
import { getCatalog } from "@/lib/glyph/catalog";
import {
  KEYBOARD_LAYOUT,
  PAD_LAYOUTS,
  getPadLayout,
  keyboardExtent,
  type KeycapKey,
} from "@/lib/glyph/layout";

/** Do two unit rectangles overlap (share positive area)? Touching edges is fine. */
function overlaps(a: KeycapKey, b: KeycapKey): boolean {
  return (
    a.x < b.x + b.w &&
    b.x < a.x + a.w &&
    a.y < b.y + b.h &&
    b.y < a.y + a.h
  );
}

describe("KEYBOARD_LAYOUT", () => {
  const keyboard = getCatalog("keyboard")!;

  it("places every keyboard Catalog Input exactly once, and nothing else", () => {
    const laidOut = KEYBOARD_LAYOUT.map((k) => k.id).sort();
    const catalog = keyboard.inputs.map((i) => i.id).sort();
    expect(laidOut).toEqual(catalog);
  });

  it("gives every keycap a positive size", () => {
    for (const key of KEYBOARD_LAYOUT) {
      expect(key.w).toBeGreaterThan(0);
      expect(key.h).toBeGreaterThan(0);
    }
  });

  it("never overlaps two keycaps", () => {
    for (let i = 0; i < KEYBOARD_LAYOUT.length; i++) {
      for (let j = i + 1; j < KEYBOARD_LAYOUT.length; j++) {
        expect(
          overlaps(KEYBOARD_LAYOUT[i], KEYBOARD_LAYOUT[j]),
          `${KEYBOARD_LAYOUT[i].id} overlaps ${KEYBOARD_LAYOUT[j].id}`,
        ).toBe(false);
      }
    }
  });

  it("keeps every keycap inside the reported extent, from the origin", () => {
    const { width, height } = keyboardExtent();
    for (const key of KEYBOARD_LAYOUT) {
      expect(key.x).toBeGreaterThanOrEqual(0);
      expect(key.y).toBeGreaterThanOrEqual(0);
      expect(key.x + key.w).toBeLessThanOrEqual(width + 1e-9);
      expect(key.y + key.h).toBeLessThanOrEqual(height + 1e-9);
    }
  });
});

describe("PAD_LAYOUTS", () => {
  it("ships a Layout for each pad Catalog", () => {
    expect(Object.keys(PAD_LAYOUTS).sort()).toEqual(["playstation", "xbox"]);
  });

  for (const catalogId of ["xbox", "playstation"]) {
    describe(catalogId, () => {
      const catalog = getCatalog(catalogId)!;
      const layout = getPadLayout(catalogId)!;

      it("has one node per Catalog Input, and nothing else", () => {
        const nodeIds = layout.nodes.map((n) => n.id).sort();
        const catalogIds = catalog.inputs.map((i) => i.id).sort();
        expect(nodeIds).toEqual(catalogIds);
      });

      it("keeps every node inside its viewBox", () => {
        for (const node of layout.nodes) {
          expect(node.x - node.r).toBeGreaterThanOrEqual(0);
          expect(node.y - node.r).toBeGreaterThanOrEqual(0);
          expect(node.x + node.r).toBeLessThanOrEqual(layout.viewBox.width);
          expect(node.y + node.r).toBeLessThanOrEqual(layout.viewBox.height);
        }
      });

      it("draws a prototype outline path", () => {
        expect(layout.outline.startsWith("M")).toBe(true);
        expect(layout.outline.length).toBeGreaterThan(10);
      });
    });
  }

  it("returns undefined for an unknown Catalog", () => {
    expect(getPadLayout("keyboard")).toBeUndefined();
    expect(getPadLayout("nope")).toBeUndefined();
  });
});

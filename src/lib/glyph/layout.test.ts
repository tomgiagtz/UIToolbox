import { describe, expect, it } from "vitest";
import { getCatalog } from "@/lib/glyph/catalog";
import {
  KEYBOARD_LAYOUT,
  MOUSE_LAYOUT,
  MOUSE_PLACEMENT,
  PAD_LAYOUTS,
  getPadLayout,
  keyboardExtent,
  type KeycapKey,
} from "@/lib/glyph/layout";

/** A rectangle in key-units — a keycap, or the mouse's slot beside the board. */
type Rect = Pick<KeycapKey, "x" | "y" | "w" | "h">;

/** Do two unit rectangles overlap (share positive area)? Touching edges is fine. */
function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

describe("KEYBOARD_LAYOUT", () => {
  const keyboard = getCatalog("keyboard")!;

  // The keyboard Device draws across *two* Layouts — the keycap board and the
  // nested mouse — so the Catalog↔Layout bijection spans both. Splitting the
  // mouse out of KEYBOARD_LAYOUT must not let an Input fall through the gap, nor
  // let one be placed on both.
  it("places every keyboard Catalog Input exactly once across the board and the mouse", () => {
    const laidOut = [
      ...KEYBOARD_LAYOUT.map((k) => k.id),
      ...MOUSE_LAYOUT.buttons.map((b) => b.id),
    ].sort();
    const catalog = keyboard.inputs.map((i) => i.id).sort();
    expect(laidOut).toEqual(catalog);
  });

  it("keeps the mouse Inputs off the keycap board", () => {
    // A mouse button drawn as a 1u keycap reads as a key, which is the whole
    // reason the mouse got a Layout of its own.
    for (const cap of KEYBOARD_LAYOUT)
      expect(cap.id.startsWith("mouse"), cap.id).toBe(false);
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

  it("reports an extent that also contains the mouse", () => {
    // The mouse is positioned in key-units beside the board, so an extent that
    // only measured keycaps would crop it out of the diagram's viewBox.
    const { width, height } = keyboardExtent();
    expect(MOUSE_PLACEMENT.x).toBeGreaterThanOrEqual(0);
    expect(MOUSE_PLACEMENT.y).toBeGreaterThanOrEqual(0);
    expect(MOUSE_PLACEMENT.x + MOUSE_PLACEMENT.w).toBeLessThanOrEqual(
      width + 1e-9,
    );
    expect(MOUSE_PLACEMENT.y + MOUSE_PLACEMENT.h).toBeLessThanOrEqual(
      height + 1e-9,
    );
  });

  it("never overlaps the mouse with a keycap", () => {
    for (const key of KEYBOARD_LAYOUT)
      expect(overlaps(key, MOUSE_PLACEMENT), key.id).toBe(false);
  });
});

describe("MOUSE_LAYOUT", () => {
  it("carries every mouse Input as a clickable button", () => {
    expect(MOUSE_LAYOUT.buttons.map((b) => b.id).sort()).toEqual([
      "mouse",
      "mouse-4",
      "mouse-5",
      "mouse-left",
      "mouse-middle",
      "mouse-right",
    ]);
  });

  it("gives every button a shape tag and geometry", () => {
    for (const button of MOUSE_LAYOUT.buttons) {
      expect(button.tag.length).toBeGreaterThan(0);
      expect(Object.keys(button.geom).length).toBeGreaterThan(0);
    }
  });

  it("has a positive viewBox", () => {
    expect(MOUSE_LAYOUT.viewBox.width).toBeGreaterThan(0);
    expect(MOUSE_LAYOUT.viewBox.height).toBeGreaterThan(0);
  });

  it("is not a pad, so it stays out of PAD_LAYOUTS", () => {
    // `getPadLayout` is called with a Catalog id and "mouse" is a keyboard Input,
    // not a Device — routing it through the pad table would make the Glyph
    // Creator try to draw the whole keyboard as a mouse.
    expect(getPadLayout("mouse")).toBeUndefined();
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

      // Bijection Catalog ↔ Layout: every Input is exactly one clickable button,
      // and no button toggles an Input the Catalog doesn't have. Holds whether the
      // Layout is code-drawn or parsed from an authored SVG.
      it("has one button per Catalog Input, and nothing else", () => {
        const buttonIds = layout.buttons.map((b) => b.id).sort();
        const catalogIds = catalog.inputs.map((i) => i.id).sort();
        expect(buttonIds).toEqual(catalogIds);
      });

      it("gives every button a shape tag and geometry", () => {
        for (const button of layout.buttons) {
          expect(button.tag.length).toBeGreaterThan(0);
          expect(Object.keys(button.geom).length).toBeGreaterThan(0);
        }
      });

      it("has a positive viewBox and a decoration layer", () => {
        expect(layout.viewBox.width).toBeGreaterThan(0);
        expect(layout.viewBox.height).toBeGreaterThan(0);
        expect(layout.decoration.length).toBeGreaterThan(0);
      });
    });
  }

  it("returns undefined for an unknown Catalog", () => {
    expect(getPadLayout("keyboard")).toBeUndefined();
    expect(getPadLayout("nope")).toBeUndefined();
  });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  isVariableWeight,
  readWeightAxis,
  staticWeight,
} from "@/lib/glyph/font-axes";

/**
 * Build the smallest SFNT that answers the one question `readWeightAxis` asks:
 * a table directory pointing at an `fvar` with the given axes.
 *
 * Hand-built rather than fixtured because the point is the *reader* — a real
 * font would also exercise a hundred bytes it never looks at, and would make a
 * missing-axis case impossible to write.
 */
function fontWithAxes(
  axes: { tag: string; min: number; def: number; max: number }[],
  { version = 0x00010000, includeFvar = true } = {},
): ArrayBuffer {
  const axisSize = 20;
  const fvarSize = 16 + axes.length * axisSize;
  const fvarOffset = 12 + 16; // header + one table record
  const buffer = new ArrayBuffer(fvarOffset + fvarSize);
  const view = new DataView(buffer);

  view.setUint32(0, version);
  view.setUint16(4, includeFvar ? 1 : 0);

  if (includeFvar) {
    view.setUint32(12, 0x66766172); // "fvar"
    view.setUint32(12 + 8, fvarOffset);
    view.setUint32(12 + 12, fvarSize);

    view.setUint16(fvarOffset + 4, 16); // axesArrayOffset, from fvar start
    view.setUint16(fvarOffset + 8, axes.length);
    view.setUint16(fvarOffset + 10, axisSize);

    axes.forEach((axis, i) => {
      const at = fvarOffset + 16 + i * axisSize;
      view.setUint32(
        at,
        axis.tag
          .split("")
          .reduce((acc, ch) => (acc << 8) | ch.charCodeAt(0), 0) >>> 0,
      );
      view.setInt32(at + 4, axis.min * 65536);
      view.setInt32(at + 8, axis.def * 65536);
      view.setInt32(at + 12, axis.max * 65536);
    });
  }

  return buffer;
}

describe("readWeightAxis", () => {
  it("reads the wght axis bounds and default", () => {
    const font = fontWithAxes([{ tag: "wght", min: 100, def: 400, max: 900 }]);
    expect(readWeightAxis(font)).toEqual({ min: 100, default: 400, max: 900 });
  });

  it("finds wght past another axis", () => {
    // Inter and Source Serif both put `opsz` first, so this is the real layout.
    const font = fontWithAxes([
      { tag: "opsz", min: 14, def: 14, max: 32 },
      { tag: "wght", min: 200, def: 400, max: 900 },
    ]);
    expect(readWeightAxis(font)).toEqual({ min: 200, default: 400, max: 900 });
  });

  it("returns null for a variable font with no weight axis", () => {
    const font = fontWithAxes([{ tag: "opsz", min: 14, def: 14, max: 32 }]);
    expect(readWeightAxis(font)).toBeNull();
  });

  it("returns null for a static font, which has no fvar at all", () => {
    expect(readWeightAxis(fontWithAxes([], { includeFvar: false }))).toBeNull();
  });

  it("declines a format whose tables it cannot read", () => {
    // "wOFF" — compressed, so the table directory offsets mean nothing here.
    const font = fontWithAxes([{ tag: "wght", min: 100, def: 400, max: 900 }], {
      version: 0x774f4646,
    });
    expect(readWeightAxis(font)).toBeNull();
  });

  it("returns null rather than throwing on bytes that aren't a font", () => {
    expect(readWeightAxis(new ArrayBuffer(3))).toBeNull();
    expect(readWeightAxis(new TextEncoder().encode("not a font").buffer)).toBe(
      null,
    );
  });
});

describe("isVariableWeight", () => {
  it("is true only when the axis offers a choice", () => {
    expect(isVariableWeight({ min: 100, max: 900, default: 400 })).toBe(true);
    expect(isVariableWeight(staticWeight())).toBe(false);
    expect(isVariableWeight(staticWeight(500))).toBe(false);
  });
});

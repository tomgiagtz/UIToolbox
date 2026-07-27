import { describe, expect, it } from "vitest";
import { pathBBox, pointsBBox } from "./path-bbox.mjs";

describe("pathBBox", () => {
  it("bounds an absolute move/line rectangle", () => {
    expect(pathBBox("M10,20 L30,20 L30,50 L10,50 Z")).toEqual({
      minX: 10,
      minY: 20,
      maxX: 30,
      maxY: 50,
    });
  });

  it("accumulates relative move/line commands", () => {
    // Same rectangle, authored the way the design tool exports it.
    expect(pathBBox("m10,20 l20,0 l0,30 l-20,0 z")).toEqual({
      minX: 10,
      minY: 20,
      maxX: 30,
      maxY: 50,
    });
  });

  it("handles horizontal and vertical shorthands, both cases", () => {
    expect(pathBBox("M0,0 H40 V25 h-10 v-5")).toEqual({
      minX: 0,
      minY: 0,
      maxX: 40,
      maxY: 25,
    });
  });

  it("bounds curve endpoints, ignoring control points that bulge outside", () => {
    // The control point (50,-100) is far outside the on-path extent; a symbol
    // centred on the control hull would sit off the visible shape.
    expect(pathBBox("M0,0 C50,-100 50,-100 20,10")).toEqual({
      minX: 0,
      minY: 0,
      maxX: 20,
      maxY: 10,
    });
  });

  it("returns to the subpath start on Z, so a following relative command is anchored there", () => {
    expect(pathBBox("M10,10 L20,10 Z l0,5")).toEqual({
      minX: 10,
      minY: 10,
      maxX: 20,
      maxY: 15,
    });
  });

  it("parses tightly packed numbers (implicit separators and exponents)", () => {
    expect(pathBBox("M.5.5L1.5-2.5")).toEqual({
      minX: 0.5,
      minY: -2.5,
      maxX: 1.5,
      maxY: 0.5,
    });
  });

  it("treats repeated coordinate pairs after L/M as implicit line-tos", () => {
    expect(pathBBox("M0,0 10,10 20,5")).toEqual({
      minX: 0,
      minY: 0,
      maxX: 20,
      maxY: 10,
    });
  });

  it("bounds arc endpoints, skipping the radii and flag parameters", () => {
    // rx/ry of 99 must not be mistaken for coordinates.
    expect(pathBBox("M0,0 A99,99 0 0 1 10,10")).toEqual({
      minX: 0,
      minY: 0,
      maxX: 10,
      maxY: 10,
    });
  });

  it("reads arc flags packed without separators, as optimisers emit them", () => {
    // SVGO writes `a1 1 0 011 1`: the large-arc flag, sweep flag and the x of
    // the endpoint run together as "011". Splitting on numbers alone would read
    // that as the single value 11 and shift the whole 7-parameter group.
    expect(pathBBox("M0,0a1 1 0 011 1")).toEqual({
      minX: 0,
      minY: 0,
      maxX: 1,
      maxY: 1,
    });
    // Same arc, spaced out — must agree.
    expect(pathBBox("M0,0a1 1 0 0 1 1 1")).toEqual(
      pathBBox("M0,0a1 1 0 011 1"),
    );
  });

  it("bounds several arc groups after one command letter", () => {
    expect(pathBBox("M0,0A1 1 0 0 1 5,5 1 1 0 0 1 10,2")).toEqual({
      minX: 0,
      minY: 0,
      maxX: 10,
      maxY: 5,
    });
  });

  it("returns undefined for empty or unparseable data", () => {
    expect(pathBBox("")).toBeUndefined();
    expect(pathBBox("   ")).toBeUndefined();
    expect(pathBBox(undefined)).toBeUndefined();
  });

  it("bounds a real d-pad arm near its visual centre", () => {
    // xbox-dpad-up, straight from the authored controller SVG.
    const box = pathBBox(
      "M312.002,461.248l-33.004,0l0,-23.25c0,0 -0.269,-6.57 2.25,-8.25c2.25,-1.5 9.501,-3 14.252,-3c4.751,0 12.002,1.5 14.252,3c2.519,1.68 2.25,8.25 2.25,8.25l-0,23.25Z",
    )!;
    expect((box.minX + box.maxX) / 2).toBeCloseTo(295.5, 1);
    expect(box.maxY).toBeCloseTo(461.248, 2);
    expect(box.maxY - box.minY).toBeGreaterThan(20);
  });
});

describe("pointsBBox", () => {
  it("bounds a polygon's point list", () => {
    expect(pointsBBox("0,0 10,20 -5,7")).toEqual({
      minX: -5,
      minY: 0,
      maxX: 10,
      maxY: 20,
    });
  });

  it("accepts whitespace-separated pairs", () => {
    expect(pointsBBox("0 0 10 20")).toEqual({
      minX: 0,
      minY: 0,
      maxX: 10,
      maxY: 20,
    });
  });

  it("returns undefined when there is no complete pair", () => {
    expect(pointsBBox("")).toBeUndefined();
    expect(pointsBBox("5")).toBeUndefined();
  });
});

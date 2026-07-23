import { describe, expect, it } from "vitest";
import {
  PAINT_ROLE_PALETTE,
  SENTINEL_HEX_BY_ROLE,
  classifyPaint,
  normalizeHex,
} from "./paint-roles.mjs";

/**
 * The sentinel palette is the shared contract between the preview and the tool
 * (issue #14). These pin the mapping and the classifier's matching rules so the
 * two can't drift.
 */
describe("paint-roles sentinel palette", () => {
  it("maps the three RGB sentinels to their roles", () => {
    expect(classifyPaint("#ff0000")).toBe("fill");
    expect(classifyPaint("#0000ff")).toBe("border");
    expect(classifyPaint("#00ff00")).toBe("secondary");
  });

  it("normalizes case, #rgb shorthand, and rgb()/rgba() forms", () => {
    expect(classifyPaint("#FF0000")).toBe("fill");
    expect(classifyPaint("#00F")).toBe("border");
    expect(classifyPaint("rgb(0, 255, 0)")).toBe("secondary");
    expect(classifyPaint("rgba(255, 0, 0, 0.5)")).toBe("fill");
  });

  it("leaves non-sentinel paints unroled", () => {
    for (const paint of ["#000", "#ffffff", "none", "currentColor", "", null]) {
      expect(classifyPaint(paint)).toBeNull();
    }
  });

  it("does not fuzzy-match near-sentinel colours", () => {
    expect(classifyPaint("#fe0000")).toBeNull();
    expect(classifyPaint("#ff0001")).toBeNull();
  });

  it("keeps the role→sentinel and normalize helpers consistent", () => {
    for (const { hex, role } of PAINT_ROLE_PALETTE) {
      expect(SENTINEL_HEX_BY_ROLE[role]).toBe(hex);
      expect(normalizeHex(hex)).toBe(hex);
    }
  });
});

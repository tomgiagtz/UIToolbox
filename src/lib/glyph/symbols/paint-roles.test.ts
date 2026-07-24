import { describe, expect, it } from "vitest";
import {
  PAINT_ROLE_PALETTE,
  SENTINEL_HEX_BY_ROLE,
  classifyPaint,
  inspectPaint,
  normalizeHex,
} from "./paint-roles.mjs";

/**
 * The sentinel palette is the shared contract between the codegen, the preview,
 * and the in-app import (ADR-0007). These pin the mapping and the classifier's
 * matching rules so they can't drift.
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

/**
 * inspectPaint is the "don't fail silently" core (ADR-0007): every paint is
 * exactly one of role / ignore / unknown, so callers can flag non-sentinel art.
 */
describe("inspectPaint three-outcome classification", () => {
  it("returns a role for exact sentinels", () => {
    expect(inspectPaint("#f00")).toEqual({ kind: "role", role: "fill" });
    expect(inspectPaint("#00F")).toEqual({ kind: "role", role: "border" });
    expect(inspectPaint("#0f0")).toEqual({ kind: "role", role: "secondary" });
  });

  it("ignores paints that render nothing", () => {
    for (const paint of ["none", "transparent", "", "  ", null, undefined]) {
      expect(inspectPaint(paint)).toEqual({ kind: "ignore" });
    }
  });

  it("flags any visible non-sentinel colour as unknown, keeping its value", () => {
    // The off-primary red a design tool exported before the atlas was corrected.
    expect(inspectPaint("#f20d0d")).toEqual({
      kind: "unknown",
      value: "#f20d0d",
    });
    expect(inspectPaint("#000")).toEqual({ kind: "unknown", value: "#000" });
    expect(inspectPaint("currentColor")).toEqual({
      kind: "unknown",
      value: "currentcolor",
    });
  });
});

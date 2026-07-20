import { describe, expect, it } from "vitest";
import { resolveStyle } from "@/lib/glyph/style";
import type { GlyphStyle, StyleOverride } from "@/lib/glyph/style";

function base(): GlyphStyle {
  return {
    textColor: "#ffffff",
    background: {
      shape: "rounded-rect",
      fill: "#1e293b",
      cornerRadius: 18,
      border: { width: 4, color: "#475569" },
    },
  };
}

describe("resolveStyle — Style Cascade (ADR-0006)", () => {
  it("returns the base style unchanged when no overrides are given", () => {
    expect(resolveStyle(base())).toEqual(base());
  });

  it("treats empty overrides as pass-through (default state)", () => {
    const empty: StyleOverride = {};
    expect(resolveStyle(base(), empty, empty, empty)).toEqual(base());
  });

  it("overrides the text color at a higher tier", () => {
    const out = resolveStyle(base(), { textColor: "#ff0000" });
    expect(out.textColor).toBe("#ff0000");
    // Background untouched.
    expect(out.background).toEqual(base().background);
  });

  it("shallow-merges a partial Background without dropping unset fields", () => {
    const out = resolveStyle(base(), { background: { shape: "circle" } });
    expect(out.background.shape).toBe("circle");
    expect(out.background.fill).toBe(base().background.fill);
    expect(out.background.cornerRadius).toBe(base().background.cornerRadius);
    expect(out.background.border).toEqual(base().background.border);
  });

  it("deep-merges a partial border, keeping the unset border field", () => {
    const out = resolveStyle(base(), { background: { border: { width: 0 } } });
    expect(out.background.border.width).toBe(0);
    expect(out.background.border.color).toBe(base().background.border.color);
  });

  it("applies tiers left-to-right so the last override wins", () => {
    const device: StyleOverride = { background: { shape: "circle", fill: "#111" } };
    const catalog: StyleOverride = { background: { fill: "#222" } };
    const glyph: StyleOverride = { textColor: "#0f0" };
    const out = resolveStyle(base(), device, catalog, glyph);
    expect(out.background.shape).toBe("circle"); // from device
    expect(out.background.fill).toBe("#222"); // catalog outranks device
    expect(out.textColor).toBe("#0f0"); // from glyph
  });

  it("lets an explicit Glyph override outrank a Catalog per-Input default", () => {
    const catalog: StyleOverride = { background: { shape: "square" } };
    const glyph: StyleOverride = { background: { shape: "none" } };
    const out = resolveStyle(base(), undefined, catalog, glyph);
    expect(out.background.shape).toBe("none");
  });

  it("does not mutate the base style", () => {
    const b = base();
    const snapshot = JSON.parse(JSON.stringify(b));
    resolveStyle(b, { background: { border: { width: 99 } } });
    expect(b).toEqual(snapshot);
  });
});

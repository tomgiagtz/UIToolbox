import { describe, expect, it } from "vitest";
import type { GlyphStyle } from "@/lib/glyph/style";
import {
  recolorSymbolSvg,
  symbolInner,
  symbolRoleColors,
} from "@/lib/glyph/symbol-render";

const style: GlyphStyle = {
  textColor: "#33cc99",
  background: {
    shape: "circle",
    fill: "#222222",
    cornerRadius: 0,
    border: { width: 0, color: "#000000" },
  },
};

describe("symbolRoleColors", () => {
  it("maps every role to the resolved text color (this slice)", () => {
    expect(symbolRoleColors(style)).toEqual({
      fill: "#33cc99",
      border: "#33cc99",
      secondary: "#33cc99",
    });
  });
});

describe("recolorSymbolSvg", () => {
  const colors = { fill: "#111111", border: "#222222", secondary: "#333333" };

  it("swaps each sentinel for its resolved role colour", () => {
    const svg =
      '<svg viewBox="0 0 256 256">' +
      '<circle style="fill:#f00;"/>' +
      '<path style="fill:none;stroke:#00f;"/>' +
      '<circle style="fill:#0f0;"/></svg>';
    const out = recolorSymbolSvg(svg, colors);
    expect(out).toContain("fill:#111111;");
    expect(out).toContain("stroke:#222222;");
    expect(out).toContain("fill:#333333;");
    // The sentinels are gone.
    expect(out).not.toMatch(/#f00\b|#00f\b|#0f0\b/);
  });

  it("normalizes 6-digit and uppercase sentinel forms", () => {
    const svg = '<path style="fill:#FF0000;stroke:#0000FF;"/>';
    const out = recolorSymbolSvg(svg, colors);
    expect(out).toBe('<path style="fill:#111111;stroke:#222222;"/>');
  });

  it("leaves non-sentinel paints authored as-is (fixed-colour pass-through)", () => {
    const svg = '<path style="fill:#123456;stroke:#f20d0d;"/>';
    expect(recolorSymbolSvg(svg, colors)).toBe(svg);
  });

  it("accepts a CSS keyword colour so the layout can recolour to currentColor", () => {
    const svg = '<circle style="fill:#f00;"/>';
    expect(
      recolorSymbolSvg(svg, {
        fill: "currentColor",
        border: "currentColor",
        secondary: "currentColor",
      }),
    ).toBe('<circle style="fill:currentColor;"/>');
  });
});

describe("symbolInner", () => {
  it("splits a standalone symbol into its viewBox and inner markup", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="512 0 256 256">' +
      '<g id="dpad-right"><path d="M0 0"/></g></svg>';
    expect(symbolInner(svg)).toEqual({
      viewBox: "512 0 256 256",
      inner: '<g id="dpad-right"><path d="M0 0"/></g>',
    });
  });

  it("returns null for markup that isn't a single viewBox'd <svg>", () => {
    expect(symbolInner("<div>nope</div>")).toBeNull();
  });
});

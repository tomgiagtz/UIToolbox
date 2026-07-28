import { describe, expect, it } from "vitest";
import {
  clearOverrideField,
  isOverrideFieldSet,
  mergeOverride,
  resolveStyle,
} from "@/lib/glyph/style";
import type { GlyphStyle, StyleOverride } from "@/lib/glyph/style";

function base(): GlyphStyle {
  return {
    textColor: "#ffffff",
    background: {
      source: { kind: "shape" },
      shape: "rounded-rect",
      fill: "#1e293b",
      cornerRadius: 18,
      border: { width: 4, color: "#475569" },
    },
    symbolPaints: { fill: "#ffffff", border: "#ffffff", secondary: "#ffffff" },
    contentScale: 1,
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
    const device: StyleOverride = {
      background: { shape: "circle", fill: "#111" },
    };
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

  it("resolves an Authored Background source from the Catalog per-Input tier (issue #18)", () => {
    const catalog: StyleOverride = {
      background: { source: { kind: "authored", backgroundId: "bumper" } },
    };
    const out = resolveStyle(base(), undefined, catalog);
    expect(out.background.source).toEqual({
      kind: "authored",
      backgroundId: "bumper",
    });
    // Falls up for everything else it doesn't set.
    expect(out.background.fill).toBe(base().background.fill);
  });

  it("carries the Background mirror flag through the cascade (issue #18)", () => {
    const catalog: StyleOverride = {
      background: {
        source: { kind: "authored", backgroundId: "bumper", flipX: true },
      },
    };
    const out = resolveStyle(base(), undefined, catalog);
    expect(out.background.source).toEqual({
      kind: "authored",
      backgroundId: "bumper",
      flipX: true,
    });
  });

  it("lets a Glyph override switch the Catalog's Background source", () => {
    const catalog: StyleOverride = {
      background: { source: { kind: "authored", backgroundId: "bumper" } },
    };
    const glyph: StyleOverride = {
      background: { source: { kind: "authored", backgroundId: "trigger" } },
    };
    const out = resolveStyle(base(), undefined, catalog, glyph);
    expect(out.background.source).toEqual({
      kind: "authored",
      backgroundId: "trigger",
    });
  });

  it("lets a Glyph override point the Background at an uploaded image (issue #22)", () => {
    const catalog: StyleOverride = {
      background: { source: { kind: "authored", backgroundId: "bumper" } },
    };
    const glyph: StyleOverride = {
      background: { source: { kind: "image", imageId: "img-1.png" } },
    };
    const out = resolveStyle(base(), undefined, catalog, glyph);
    expect(out.background.source).toEqual({
      kind: "image",
      imageId: "img-1.png",
    });
  });

  it("lets a Glyph override drop the Catalog's tile by choosing the shape (issue #18)", () => {
    // Clearing the Glyph tier's own field only makes it fall back to the tile
    // again, so "no tile" needs an explicit value the cascade can carry.
    const catalog: StyleOverride = {
      background: {
        source: { kind: "authored", backgroundId: "bumper", flipX: true },
      },
    };
    const glyph: StyleOverride = {
      background: { source: { kind: "shape" }, shape: "circle" },
    };
    const out = resolveStyle(base(), undefined, catalog, glyph);
    // The mirror flag rode on the source, so it goes with it.
    expect(out.background.source).toEqual({ kind: "shape" });
    expect(out.background.shape).toBe("circle");
  });

  it("treats an explicit shape source at the Device tier as no tile, not as unset", () => {
    const device: StyleOverride = { background: { source: { kind: "shape" } } };
    const catalog: StyleOverride = {
      background: { source: { kind: "authored", backgroundId: "bumper" } },
    };
    // Catalog outranks Device, so the tile still wins here...
    expect(resolveStyle(base(), device, catalog).background.source).toEqual({
      kind: "authored",
      backgroundId: "bumper",
    });
    // ...but with no Catalog tile, the Device's choice resolves to no tile.
    expect(resolveStyle(base(), device, undefined).background.source).toEqual({
      kind: "shape",
    });
  });

  it("resolves each Symbol Paint Role independently through the cascade (#37)", () => {
    const device: StyleOverride = { symbolPaints: { fill: "#0f0" } };
    const glyph: StyleOverride = { symbolPaints: { border: "#00f" } };
    const out = resolveStyle(base(), device, glyph);
    expect(out.symbolPaints.fill).toBe("#0f0"); // device tier
    expect(out.symbolPaints.border).toBe("#00f"); // glyph tier
    // Unset role falls up to the base.
    expect(out.symbolPaints.secondary).toBe(base().symbolPaints.secondary);
  });

  it("lets a higher tier override just one Symbol Paint Role", () => {
    const out = resolveStyle(base(), { symbolPaints: { secondary: "#f0f" } });
    expect(out.symbolPaints).toEqual({
      ...base().symbolPaints,
      secondary: "#f0f",
    });
  });

  it("resolves the content scale through the cascade (issue #20)", () => {
    const device: StyleOverride = { contentScale: 0.8 };
    const glyph: StyleOverride = { contentScale: 1.5 };
    expect(resolveStyle(base(), device).contentScale).toBe(0.8);
    expect(resolveStyle(base(), device, undefined, glyph).contentScale).toBe(
      1.5,
    );
    // Unset at every tier falls back to the Project base.
    expect(resolveStyle(base(), {}).contentScale).toBe(1);
  });

  it("does not mutate the base style", () => {
    const b = base();
    const snapshot = JSON.parse(JSON.stringify(b));
    resolveStyle(b, { background: { border: { width: 99 } } });
    expect(b).toEqual(snapshot);
  });
});

describe("mergeOverride", () => {
  it("returns an empty override when both sides are empty", () => {
    expect(mergeOverride({}, {})).toEqual({});
  });

  it("layers text color and background from the patch", () => {
    const out = mergeOverride({}, { textColor: "#f00" });
    expect(out).toEqual({ textColor: "#f00" });
  });

  it("deep-merges background so the patch keeps the base's other fields", () => {
    const base: StyleOverride = {
      background: { shape: "circle", fill: "#111" },
    };
    const out = mergeOverride(base, { background: { fill: "#222" } });
    expect(out.background).toEqual({ shape: "circle", fill: "#222" });
  });

  it("deep-merges the border, keeping the base's unset border field", () => {
    const base: StyleOverride = { background: { border: { width: 4 } } };
    const out = mergeOverride(base, {
      background: { border: { color: "#0f0" } },
    });
    expect(out.background?.border).toEqual({ width: 4, color: "#0f0" });
  });

  it("replaces the Background source wholesale rather than merging it (issue #22)", () => {
    const base: StyleOverride = {
      background: {
        source: { kind: "authored", backgroundId: "bumper", flipX: true },
        fill: "#111",
      },
    };
    const out = mergeOverride(base, {
      background: { source: { kind: "image", imageId: "img-1.png" } },
    });
    // No trace of the authored tile's mirror flag on the uploaded one...
    expect(out.background?.source).toEqual({
      kind: "image",
      imageId: "img-1.png",
    });
    // ...while the rest of the Background patch still merges as usual.
    expect(out.background?.fill).toBe("#111");
  });

  it("replaces the Render Source wholesale rather than merging it (issue #20)", () => {
    const base: StyleOverride = {
      renderSource: { kind: "image", imageId: "img-1.png" },
    };
    const out = mergeOverride(base, { renderSource: { kind: "label" } });
    expect(out.renderSource).toEqual({ kind: "label" });
  });

  it("keeps an existing Render Source when the patch doesn't set one", () => {
    const base: StyleOverride = { renderSource: { kind: "label" } };
    const out = mergeOverride(base, { contentScale: 0.5 });
    expect(out).toEqual({ renderSource: { kind: "label" }, contentScale: 0.5 });
  });

  it("layers the content scale from the patch", () => {
    expect(mergeOverride({ contentScale: 1.2 }, { contentScale: 0.9 })).toEqual(
      {
        contentScale: 0.9,
      },
    );
  });

  it("does not mutate either input", () => {
    const base: StyleOverride = { background: { border: { width: 4 } } };
    const snapshot = JSON.parse(JSON.stringify(base));
    mergeOverride(base, { background: { border: { color: "#0f0" } } });
    expect(base).toEqual(snapshot);
  });
});

describe("isOverrideFieldSet", () => {
  it("detects a set top-level and nested field", () => {
    expect(isOverrideFieldSet({ textColor: "#f00" }, "textColor")).toBe(true);
    expect(
      isOverrideFieldSet(
        { background: { border: { width: 2 } } },
        "borderWidth",
      ),
    ).toBe(true);
  });

  it("returns false for an unset field", () => {
    expect(isOverrideFieldSet({}, "fill")).toBe(false);
    expect(isOverrideFieldSet({ background: { fill: "#111" } }, "shape")).toBe(
      false,
    );
  });

  it("detects a set Symbol Paint Role", () => {
    expect(
      isOverrideFieldSet({ symbolPaints: { fill: "#0f0" } }, "symbolFill"),
    ).toBe(true);
    expect(
      isOverrideFieldSet({ symbolPaints: { fill: "#0f0" } }, "symbolBorder"),
    ).toBe(false);
  });

  it("detects a set Render Source and content scale (issue #20)", () => {
    expect(
      isOverrideFieldSet({ renderSource: { kind: "label" } }, "renderSource"),
    ).toBe(true);
    expect(isOverrideFieldSet({}, "renderSource")).toBe(false);
    expect(isOverrideFieldSet({ contentScale: 0.5 }, "contentScale")).toBe(
      true,
    );
    expect(isOverrideFieldSet({}, "contentScale")).toBe(false);
  });

  it("detects a set Background source", () => {
    expect(
      isOverrideFieldSet(
        {
          background: { source: { kind: "authored", backgroundId: "bumper" } },
        },
        "backgroundSource",
      ),
    ).toBe(true);
    expect(
      isOverrideFieldSet(
        { background: { source: { kind: "shape" } } },
        "backgroundSource",
      ),
    ).toBe(true);
    expect(
      isOverrideFieldSet({ background: { fill: "#111" } }, "backgroundSource"),
    ).toBe(false);
  });
});

describe("clearOverrideField", () => {
  it("removes the text color, collapsing to empty", () => {
    expect(clearOverrideField({ textColor: "#f00" }, "textColor")).toEqual({});
  });

  it("removes a background sub-property but keeps the rest", () => {
    const out = clearOverrideField(
      { background: { shape: "circle", fill: "#111" } },
      "fill",
    );
    expect(out).toEqual({ background: { shape: "circle" } });
  });

  it("collapses the background when its last property is cleared", () => {
    expect(
      clearOverrideField({ background: { fill: "#111" } }, "fill"),
    ).toEqual({});
  });

  it("removes one border field but keeps the other", () => {
    const out = clearOverrideField(
      { background: { border: { width: 4, color: "#0f0" } } },
      "borderWidth",
    );
    expect(out).toEqual({ background: { border: { color: "#0f0" } } });
  });

  it("collapses background and border when the last border field is cleared", () => {
    expect(
      clearOverrideField(
        { background: { border: { color: "#0f0" } } },
        "borderColor",
      ),
    ).toEqual({});
  });

  it("removes one Symbol Paint Role but keeps the others", () => {
    const out = clearOverrideField(
      { symbolPaints: { fill: "#0f0", border: "#00f" } },
      "symbolFill",
    );
    expect(out).toEqual({ symbolPaints: { border: "#00f" } });
  });

  it("collapses the symbolPaints group when its last role is cleared", () => {
    expect(
      clearOverrideField(
        { symbolPaints: { secondary: "#f0f" } },
        "symbolSecondary",
      ),
    ).toEqual({});
  });

  it("clears the Background source, collapsing to empty", () => {
    expect(
      clearOverrideField(
        {
          background: { source: { kind: "authored", backgroundId: "bumper" } },
        },
        "backgroundSource",
      ),
    ).toEqual({});
    // The mirror flag rides on the source, so it can't survive it.
    expect(
      clearOverrideField(
        {
          background: {
            source: { kind: "authored", backgroundId: "bumper", flipX: true },
          },
        },
        "backgroundSource",
      ),
    ).toEqual({});
  });

  it("clears the Render Source and the content scale (issue #20)", () => {
    expect(
      clearOverrideField({ renderSource: { kind: "label" } }, "renderSource"),
    ).toEqual({});
    expect(clearOverrideField({ contentScale: 0.5 }, "contentScale")).toEqual(
      {},
    );
    // Independent of one another and of the rest of the override.
    expect(
      clearOverrideField(
        {
          renderSource: { kind: "symbol" },
          contentScale: 2,
          textColor: "#f00",
        },
        "renderSource",
      ),
    ).toEqual({ contentScale: 2, textColor: "#f00" });
  });

  it("is a no-op when the field is not set", () => {
    expect(clearOverrideField({ textColor: "#f00" }, "fill")).toEqual({
      textColor: "#f00",
    });
  });
});

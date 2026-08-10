import { describe, expect, it } from "vitest";
import {
  clearOverrideField,
  isOverrideFieldSet,
  mergeOverride,
  normalizeRotation,
  resolveGlyphStyle,
  resolveStyle,
} from "@/lib/glyph/style";
import type { GlyphStyle, StyleOverride } from "@/lib/glyph/style";
import type { BackgroundSource } from "@/lib/glyph/types";
import { identityTransform } from "@/lib/glyph/defaults";

function base(): GlyphStyle {
  return {
    background: {
      source: { kind: "shape" },
      transform: identityTransform(),
      shape: "rounded-rect",
      fill: "#1e293b",
      cornerRadius: 18,
      border: { width: 4, color: "#475569" },
    },
    foreground: {
      transform: identityTransform(),
      textColor: "#ffffff",
      symbolPaints: {
        fill: "#ffffff",
        border: "#ffffff",
        secondary: "#ffffff",
      },
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
    const out = resolveStyle(base(), { foreground: { textColor: "#ff0000" } });
    expect(out.foreground.textColor).toBe("#ff0000");
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
    const glyph: StyleOverride = {
      background: { fill: "#222" },
      foreground: { textColor: "#0f0" },
    };
    const out = resolveStyle(base(), device, glyph);
    expect(out.background.shape).toBe("circle"); // from device
    expect(out.background.fill).toBe("#222"); // glyph outranks device
    expect(out.foreground.textColor).toBe("#0f0"); // from glyph
  });

  it("lets an explicit Glyph override outrank the Device tier", () => {
    const device: StyleOverride = { background: { shape: "square" } };
    const glyph: StyleOverride = { background: { shape: "circle" } };
    expect(resolveStyle(base(), device, glyph).background.shape).toBe("circle");
  });

  it("resolves each Symbol Paint Role independently through the cascade (#37)", () => {
    const device: StyleOverride = {
      foreground: { symbolPaints: { fill: "#0f0" } },
    };
    const glyph: StyleOverride = {
      foreground: { symbolPaints: { border: "#00f" } },
    };
    const out = resolveStyle(base(), device, glyph);
    expect(out.foreground.symbolPaints.fill).toBe("#0f0"); // device tier
    expect(out.foreground.symbolPaints.border).toBe("#00f"); // glyph tier
    // Unset role falls up to the base.
    expect(out.foreground.symbolPaints.secondary).toBe(
      base().foreground.symbolPaints.secondary,
    );
  });

  it("lets a higher tier override just one Symbol Paint Role", () => {
    const out = resolveStyle(base(), {
      foreground: { symbolPaints: { secondary: "#f0f" } },
    });
    expect(out.foreground.symbolPaints).toEqual({
      ...base().foreground.symbolPaints,
      secondary: "#f0f",
    });
  });

  it("resolves both layer transforms through the cascade (ADR-0012 §2)", () => {
    const device: StyleOverride = {
      background: { transform: { rotation: 90 } },
      foreground: { transform: { scale: { x: 0.8, y: 0.8 } } },
    };
    const out = resolveStyle(base(), device);
    expect(out.background.transform.rotation).toBe(90);
    expect(out.foreground.transform.scale).toEqual({ x: 0.8, y: 0.8 });
    // Neither layer is aware of the other: the tile turned, the content didn't.
    expect(out.foreground.transform.rotation).toBe(0);
    expect(out.background.transform.scale).toEqual({ x: 1, y: 1 });
    // Unset at every tier falls back to the Project base's identity.
    expect(resolveStyle(base(), {}).foreground.transform).toEqual({
      rotation: 0,
      scale: { x: 1, y: 1 },
    });
  });

  it("falls each transform component up independently", () => {
    const device: StyleOverride = {
      foreground: { transform: { rotation: 90 } },
    };
    const glyph: StyleOverride = {
      foreground: { transform: { scale: { x: -1 } } },
    };
    const out = resolveStyle(base(), device, glyph);
    // The Glyph said nothing about rotation, so the Device's survives...
    expect(out.foreground.transform.rotation).toBe(90);
    // ...and the axis it didn't name keeps the base's scale.
    expect(out.foreground.transform.scale).toEqual({ x: -1, y: 1 });
  });

  it("replaces a lower tier's rotation rather than composing with it", () => {
    const device: StyleOverride = {
      foreground: { transform: { rotation: 90 } },
    };
    const glyph: StyleOverride = { foreground: { transform: { rotation: 0 } } };
    // `rotation: 0` at the Glyph tier means upright, not "turn back by 90".
    expect(
      resolveStyle(base(), device, glyph).foreground.transform.rotation,
    ).toBe(0);
  });

  it("resolves a rotation without normalising it", () => {
    // Normalisation is a write-boundary job (`normalizeRotation`), not this
    // fold's: every finite value already draws correctly, so doing the
    // arithmetic on every render would buy nothing.
    const turns = (rotation: number) =>
      resolveStyle(base(), { foreground: { transform: { rotation } } })
        .foreground.transform.rotation;
    expect(turns(-90)).toBe(-90);
    expect(turns(450)).toBe(450);
  });

  it("does not mutate the base style", () => {
    const b = base();
    const snapshot = JSON.parse(JSON.stringify(b));
    resolveStyle(b, { background: { border: { width: 99 } } });
    expect(b).toEqual(snapshot);
  });
});

describe("resolveGlyphStyle — the Catalog seed's rank (ADR-0012 §2)", () => {
  /** What a mirrored shoulder's Catalog entry seeds: a tile, facing left. */
  const TILE: BackgroundSource = { kind: "authored", backgroundId: "bumper" };
  const SEED: StyleOverride = {
    background: { source: TILE, transform: { scale: { x: -1 } } },
  };

  it("draws the seeded tile when the user has set nothing", () => {
    const out = resolveGlyphStyle(base(), SEED, undefined, undefined);
    expect(out.background.source).toEqual(TILE);
    // The seed says only what the tile *is* and which way it faces; everything
    // else falls up — including the axis it left alone.
    expect(out.background.transform).toEqual({
      rotation: 0,
      scale: { x: -1, y: 1 },
    });
    expect(out.background.fill).toBe(base().background.fill);
  });

  it("mirrors only the tile layer, leaving the content upright", () => {
    // What `flipX` bought by riding inside the source, kept now that it doesn't:
    // the label or Symbol drawn on a left bumper is not written backwards.
    const out = resolveGlyphStyle(base(), SEED, undefined, undefined);
    expect(out.foreground.transform.scale).toEqual({ x: 1, y: 1 });
  });

  it("lets a Glyph face a seeded control back the other way", () => {
    // The papercut `flipX` left: orientation is now a control of its own, so a
    // state the Catalog put you in is one you can leave.
    const glyph: StyleOverride = {
      background: { transform: { scale: { x: 1 } } },
    };
    const out = resolveGlyphStyle(base(), SEED, undefined, glyph);
    expect(out.background.transform.scale.x).toBe(1);
    // ...without disturbing the tile it applies to.
    expect(out.background.source).toEqual(TILE);
  });

  it("falls through to the Project base for an Input with no seed", () => {
    const out = resolveGlyphStyle(base(), undefined, undefined, undefined);
    expect(out.background.source).toEqual({ kind: "shape" });
  });

  it("outranks a project-wide source, so a seeded Input keeps its tile", () => {
    // The row that proves the seed is a *rank* and not a fallback: a fallback
    // would never fire, since the Project base always carries a source.
    const project: GlyphStyle = {
      ...base(),
      background: {
        ...base().background,
        source: { kind: "image", imageId: "img-1.png" },
      },
    };
    expect(
      resolveGlyphStyle(project, SEED, undefined, undefined).background.source,
    ).toEqual(TILE);
    // An unseeded Input on the same project does take the uploaded tile.
    expect(
      resolveGlyphStyle(project, undefined, undefined, undefined).background
        .source,
    ).toEqual({ kind: "image", imageId: "img-1.png" });
  });

  it("lets the Device tier recolour a seeded tile without replacing it", () => {
    const device: StyleOverride = { background: { fill: "#f00" } };
    const out = resolveGlyphStyle(base(), SEED, device, undefined);
    expect(out.background.source).toEqual(TILE);
    expect(out.background.fill).toBe("#f00");
  });

  it("applies a device-wide source to an Input the Catalog does not seed", () => {
    const device: StyleOverride = {
      background: { source: { kind: "image", imageId: "keycap.png" } },
    };
    expect(
      resolveGlyphStyle(base(), undefined, device, undefined).background.source,
    ).toEqual({ kind: "image", imageId: "keycap.png" });
  });

  it("lets the seed outrank a device-wide source on a seeded Input", () => {
    // The accepted consequence of ranking the seed above the Device tier: a
    // device-wide source no-ops on the shoulders, escapable only per-Glyph.
    const device: StyleOverride = { background: { source: { kind: "none" } } };
    expect(
      resolveGlyphStyle(base(), SEED, device, undefined).background.source,
    ).toEqual(TILE);
  });

  it("lets a Glyph override outrank the seed", () => {
    const glyph: StyleOverride = {
      background: { source: { kind: "authored", backgroundId: "trigger" } },
    };
    expect(
      resolveGlyphStyle(base(), SEED, undefined, glyph).background.source,
    ).toEqual({ kind: "authored", backgroundId: "trigger" });
  });

  it("distinguishes an explicit Glyph shape from an omitted source", () => {
    // The tri-state survives the tier's deletion: omitting the field falls to the
    // seed, so only an explicit value can turn the tile off. Its justification
    // changed (the seed outranks the base, rather than the Catalog tier
    // outranking Device); the behaviour did not.
    const explicit: StyleOverride = {
      background: { source: { kind: "shape" }, shape: "circle" },
    };
    const out = resolveGlyphStyle(base(), SEED, undefined, explicit);
    expect(out.background.source).toEqual({ kind: "shape" });
    // Orientation is no part of a source, so replacing one leaves the seeded
    // mirror standing — this Glyph said nothing about which way it faces.
    expect(out.background.transform.scale.x).toBe(-1);
    expect(out.background.shape).toBe("circle");

    const omitted: StyleOverride = { background: { shape: "circle" } };
    expect(
      resolveGlyphStyle(base(), SEED, undefined, omitted).background.source,
    ).toEqual(TILE);
  });

  it('lets a Glyph turn the seeded tile off entirely with "none"', () => {
    // Why "none" is a source and not a fourth shape: a shape can only suppress
    // the drawn primitive, leaving the seeded tile showing underneath.
    const glyph: StyleOverride = { background: { source: { kind: "none" } } };
    expect(
      resolveGlyphStyle(base(), SEED, undefined, glyph).background.source,
    ).toEqual({ kind: "none" });
  });

  it("does not mutate the base style", () => {
    const b = base();
    const snapshot = JSON.parse(JSON.stringify(b));
    resolveGlyphStyle(b, SEED, { background: { fill: "#f00" } }, undefined);
    expect(b).toEqual(snapshot);
  });
});

describe("mergeOverride", () => {
  it("returns an empty override when both sides are empty", () => {
    expect(mergeOverride({}, {})).toEqual({});
  });

  it("layers text color and background from the patch", () => {
    const out = mergeOverride({}, { foreground: { textColor: "#f00" } });
    expect(out).toEqual({ foreground: { textColor: "#f00" } });
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
        source: { kind: "authored", backgroundId: "bumper" },
        fill: "#111",
      },
    };
    const out = mergeOverride(base, {
      background: { source: { kind: "image", imageId: "img-1.png" } },
    });
    // The new source stands alone rather than half-merging with the old...
    expect(out.background?.source).toEqual({
      kind: "image",
      imageId: "img-1.png",
    });
    // ...while the rest of the Background patch still merges as usual.
    expect(out.background?.fill).toBe("#111");
  });

  it("replaces the Render Source wholesale rather than merging it (issue #20)", () => {
    const base: StyleOverride = {
      foreground: { renderSource: { kind: "image", imageId: "img-1.png" } },
    };
    const out = mergeOverride(base, {
      foreground: { renderSource: { kind: "label" } },
    });
    expect(out.foreground?.renderSource).toEqual({ kind: "label" });
  });

  it("keeps an existing Render Source when the patch doesn't set one", () => {
    const base: StyleOverride = {
      foreground: { renderSource: { kind: "label" } },
    };
    const out = mergeOverride(base, {
      foreground: { transform: { rotation: 90 } },
    });
    expect(out).toEqual({
      foreground: {
        renderSource: { kind: "label" },
        transform: { rotation: 90 },
      },
    });
  });

  it("merges a layer transform component-by-component", () => {
    const base: StyleOverride = {
      foreground: { transform: { rotation: 90, scale: { x: -1 } } },
    };
    const out = mergeOverride(base, {
      foreground: { transform: { scale: { y: 2 } } },
    });
    // The patch named one axis, so the rotation and the other axis stand.
    expect(out.foreground?.transform).toEqual({
      rotation: 90,
      scale: { x: -1, y: 2 },
    });
  });

  it("keeps a rotation exactly as the patch spelled it", () => {
    const out = mergeOverride(
      {},
      { background: { transform: { rotation: -90 } } },
    );
    expect(out.background?.transform?.rotation).toBe(-90);
  });

  it("does not mutate either input", () => {
    const base: StyleOverride = { background: { border: { width: 4 } } };
    const snapshot = JSON.parse(JSON.stringify(base));
    mergeOverride(base, { background: { border: { color: "#0f0" } } });
    expect(base).toEqual(snapshot);
  });
});

describe("normalizeRotation", () => {
  it("folds an out-of-range angle into −180…180", () => {
    expect(normalizeRotation(270)).toBe(-90);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-270)).toBe(90);
    expect(normalizeRotation(720)).toBe(0);
  });

  it("passes an in-range angle through untouched, both extremes included", () => {
    // The reason this isn't the usual one-liner: that maps 180 to −180, so the
    // slider would snap to the opposite end from the one just dragged to.
    expect(normalizeRotation(180)).toBe(180);
    expect(normalizeRotation(-180)).toBe(-180);
    expect(normalizeRotation(-90)).toBe(-90);
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(22.5)).toBe(22.5);
  });
});

describe("isOverrideFieldSet", () => {
  it("detects a set top-level and nested field", () => {
    expect(
      isOverrideFieldSet({ foreground: { textColor: "#f00" } }, "textColor"),
    ).toBe(true);
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
      isOverrideFieldSet(
        { foreground: { symbolPaints: { fill: "#0f0" } } },
        "symbolFill",
      ),
    ).toBe(true);
    expect(
      isOverrideFieldSet(
        { foreground: { symbolPaints: { fill: "#0f0" } } },
        "symbolBorder",
      ),
    ).toBe(false);
  });

  it("detects a set Render Source (issue #20)", () => {
    expect(
      isOverrideFieldSet(
        { foreground: { renderSource: { kind: "label" } } },
        "renderSource",
      ),
    ).toBe(true);
    expect(isOverrideFieldSet({}, "renderSource")).toBe(false);
  });

  it("detects rotation and scale separately, per layer (ADR-0012 §2)", () => {
    const mirrored: StyleOverride = {
      background: { transform: { scale: { x: -1 } } },
    };
    expect(isOverrideFieldSet(mirrored, "backgroundScale")).toBe(true);
    // Two entries per layer: mirroring says nothing about the rotation...
    expect(isOverrideFieldSet(mirrored, "backgroundRotation")).toBe(false);
    // ...and nothing at all about the other layer.
    expect(isOverrideFieldSet(mirrored, "foregroundScale")).toBe(false);
    expect(
      isOverrideFieldSet(
        { foreground: { transform: { rotation: 90 } } },
        "foregroundRotation",
      ),
    ).toBe(true);
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
    expect(
      clearOverrideField({ foreground: { textColor: "#f00" } }, "textColor"),
    ).toEqual({});
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
      { foreground: { symbolPaints: { fill: "#0f0", border: "#00f" } } },
      "symbolFill",
    );
    expect(out).toEqual({ foreground: { symbolPaints: { border: "#00f" } } });
  });

  it("collapses the symbolPaints group when its last role is cleared", () => {
    expect(
      clearOverrideField(
        { foreground: { symbolPaints: { secondary: "#f0f" } } },
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
    // Orientation is no longer part of a source, so clearing one leaves the
    // layer's transform exactly where it was.
    expect(
      clearOverrideField(
        {
          background: {
            source: { kind: "authored", backgroundId: "bumper" },
            transform: { scale: { x: -1 } },
          },
        },
        "backgroundSource",
      ),
    ).toEqual({ background: { transform: { scale: { x: -1 } } } });
  });

  it("clears one transform component, leaving the other (ADR-0012 §2)", () => {
    // Two reset entries per layer, because rotation and scale are two controls:
    // clearing the mirror must not take a rotation set beside it.
    expect(
      clearOverrideField(
        { foreground: { transform: { rotation: 90, scale: { x: -1 } } } },
        "foregroundScale",
      ),
    ).toEqual({ foreground: { transform: { rotation: 90 } } });
    // Clearing the last component collapses the transform, then the layer.
    expect(
      clearOverrideField(
        { foreground: { transform: { rotation: 90 } } },
        "foregroundRotation",
      ),
    ).toEqual({});
    expect(
      clearOverrideField(
        { background: { fill: "#111", transform: { rotation: 90 } } },
        "backgroundRotation",
      ),
    ).toEqual({ background: { fill: "#111" } });
    // The layers clear independently.
    expect(
      clearOverrideField(
        {
          background: { transform: { rotation: 90 } },
          foreground: { transform: { rotation: 45 } },
        },
        "backgroundRotation",
      ),
    ).toEqual({ foreground: { transform: { rotation: 45 } } });
  });

  it("clears the Render Source (issue #20)", () => {
    expect(
      clearOverrideField(
        { foreground: { renderSource: { kind: "label" } } },
        "renderSource",
      ),
    ).toEqual({});
    // Independent of the rest of the override.
    expect(
      clearOverrideField(
        {
          foreground: {
            renderSource: { kind: "symbol" },
            transform: { rotation: 90 },
            textColor: "#f00",
          },
        },
        "renderSource",
      ),
    ).toEqual({
      foreground: { transform: { rotation: 90 }, textColor: "#f00" },
    });
  });

  it("is a no-op when the field is not set", () => {
    expect(
      clearOverrideField({ foreground: { textColor: "#f00" } }, "fill"),
    ).toEqual({ foreground: { textColor: "#f00" } });
  });
});

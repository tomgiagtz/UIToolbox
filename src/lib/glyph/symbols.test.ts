import { describe, expect, it } from "vitest";
import {
  AUTHORED_BACKGROUNDS,
  SYMBOL_ASSETS,
  SYMBOLS,
  getSymbolAsset,
  getSymbolSvg,
  resolveSymbolSvg,
} from "@/lib/glyph/symbols";

/**
 * The manifest is the shipped contract (issue #14): these pin its shape and the
 * required assets. The per-asset SVGs are authored separately in the atlases and
 * checked here only for whatever has been drawn, so the slice can land
 * device-by-device without failing on `pending` ids.
 */
describe("symbol manifest", () => {
  it("has unique ids", () => {
    const ids = SYMBOL_ASSETS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every asset a non-empty label and a known kind", () => {
    for (const a of SYMBOL_ASSETS) {
      expect(a.label.length).toBeGreaterThan(0);
      expect(["symbol", "background"]).toContain(a.kind);
    }
  });

  it("ships the Xbox face buttons as symbols", () => {
    for (const id of ["xbox-a", "xbox-b", "xbox-x", "xbox-y"]) {
      const asset = getSymbolAsset(id);
      expect(asset, id).toBeDefined();
      expect(asset?.kind).toBe("symbol");
    }
  });

  it("shares only the cross-device stick art this pass", () => {
    expect(getSymbolAsset("stick")?.atlas).toBe("shared");
    // No shared d-pad yet — it's authored in the device atlas for now.
    expect(getSymbolAsset("dpad-right")?.atlas).toBe("xbox");
  });

  it("keeps the device-specific bumper/trigger tiles in the device atlas", () => {
    for (const id of ["xbox-bumper", "xbox-trigger"]) {
      const asset = getSymbolAsset(id);
      expect(asset?.kind, id).toBe("background");
      expect(asset?.atlas, id).toBe("xbox");
    }
    expect(AUTHORED_BACKGROUNDS.map((a) => a.id)).toEqual([
      "xbox-bumper",
      "xbox-trigger",
    ]);
    expect(SYMBOLS.every((a) => a.kind === "symbol")).toBe(true);
  });

  it("derives the other three d-pad directions by rotating dpad-right", () => {
    expect(getSymbolAsset("dpad-right")?.rotateOf).toBeUndefined();
    for (const [id, deg] of [
      ["dpad-down", 90],
      ["dpad-left", 180],
      ["dpad-up", 270],
    ] as const) {
      const asset = getSymbolAsset(id);
      expect(asset?.rotateOf, id).toBe("dpad-right");
      expect(asset?.rotate, id).toBe(deg);
      expect(asset?.atlas, `${id} is derived, not authored`).toBeUndefined();
    }
  });
});

describe("authored symbol SVGs", () => {
  it("only exposes SVGs for manifest ids, each a square-viewBox <svg>", () => {
    for (const a of SYMBOL_ASSETS) {
      const svg = getSymbolSvg(a.id);
      if (!svg) continue; // not drawn yet — falls back to the label
      expect(svg.startsWith("<svg")).toBe(true);
      const vb = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(svg);
      expect(vb, `${a.id} needs a viewBox`).not.toBeNull();
      const [, , , w, h] = vb!.map(Number);
      expect(w, `${a.id} viewBox must be square`).toBe(h);
    }
  });

  it("emits a rotation transform for derived directions once the source exists", () => {
    if (!getSymbolSvg("dpad-right")) return; // source not drawn yet
    expect(getSymbolSvg("dpad-down")).toContain("rotate(90");
    expect(getSymbolSvg("dpad-left")).toContain("rotate(180");
    expect(getSymbolSvg("dpad-up")).toContain("rotate(270");
  });

  // Colour is not enforced here: Symbols keep their authored colours as the
  // tool-configurable defaults (see manifest.mjs), so no currentColor / no-hex
  // rule applies to the generated markup.
});

describe("shared → device override cascade", () => {
  const svgs = {
    "dpad-up": "<svg>shared-up</svg>",
    "dpad-right": "<svg>shared-right</svg>",
    "playstation:dpad-up": "<svg>ps-up</svg>",
    "playstation:dpad-right": "<svg>ps-right</svg>",
  };

  it("prefers a device override over the shared base", () => {
    expect(resolveSymbolSvg(svgs, "dpad-up", "playstation")).toBe(
      "<svg>ps-up</svg>",
    );
    expect(resolveSymbolSvg(svgs, "dpad-right", "playstation")).toBe(
      "<svg>ps-right</svg>",
    );
  });

  it("falls back to the shared base for devices without an override", () => {
    expect(resolveSymbolSvg(svgs, "dpad-up", "xbox")).toBe(
      "<svg>shared-up</svg>",
    );
    expect(resolveSymbolSvg(svgs, "dpad-up")).toBe("<svg>shared-up</svg>");
  });

  it("returns undefined for an unknown id", () => {
    expect(resolveSymbolSvg(svgs, "nope", "playstation")).toBeUndefined();
  });
});

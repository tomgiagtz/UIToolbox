import { describe, expect, it } from "vitest";
import {
  AUTHORED_BACKGROUNDS,
  authoredBackgroundsFor,
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

  it("ships each pad's face buttons as symbols", () => {
    for (const id of ["a", "b", "x", "y", "cross", "circle", "square"]) {
      const asset = getSymbolAsset(id);
      expect(asset, id).toBeDefined();
      expect(asset?.kind).toBe("symbol");
    }
  });

  it("keeps ids bare, so no id carries a device prefix", () => {
    // The atlas a cell lives in is what scopes it to a Device; a prefixed id
    // would encode that scope twice and let the two disagree.
    for (const a of SYMBOL_ASSETS)
      expect(a.id, a.id).not.toMatch(/^(xbox|playstation|ps)-/);
  });

  it("shares only the cross-device stick art this pass", () => {
    expect(getSymbolAsset("stick")?.atlases).toEqual(["shared"]);
  });

  it("draws the bumper/trigger tiles and the d-pad once per pad", () => {
    for (const id of ["bumper", "trigger"]) {
      const asset = getSymbolAsset(id);
      expect(asset?.kind, id).toBe("background");
      expect(asset?.atlases, id).toEqual(["xbox", "playstation"]);
    }
    // Same id on both pads, but each pad draws its own shape.
    expect(getSymbolAsset("dpad-right")?.atlases).toEqual([
      "xbox",
      "playstation",
    ]);
    expect(AUTHORED_BACKGROUNDS.map((a) => a.id)).toEqual([
      "bumper",
      "trigger",
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
      expect(asset?.atlases, `${id} is derived, not authored`).toBeUndefined();
    }
  });
});

describe("authored symbol SVGs", () => {
  /** Every Device scope an asset can resolve in, plus the unscoped fallback. */
  const scopes = [undefined, "xbox", "playstation"] as const;

  it("only exposes SVGs for manifest ids, each a square-viewBox <svg>", () => {
    for (const a of SYMBOL_ASSETS) {
      for (const scope of scopes) {
        const svg = getSymbolSvg(a.id, scope);
        if (!svg) continue; // not drawn in this scope — falls back to the label
        const where = `${a.id}@${scope ?? "shared"}`;
        expect(svg.startsWith("<svg")).toBe(true);
        const vb = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(
          svg,
        );
        expect(vb, `${where} needs a viewBox`).not.toBeNull();
        const [, , , w, h] = vb!.map(Number);
        expect(w, `${where} viewBox must be square`).toBe(h);
      }
    }
  });

  it("emits a rotation transform for derived directions, per pad", () => {
    for (const pad of ["xbox", "playstation"]) {
      if (!getSymbolSvg("dpad-right", pad)) continue; // source not drawn yet
      expect(getSymbolSvg("dpad-down", pad), pad).toContain("rotate(90");
      expect(getSymbolSvg("dpad-left", pad), pad).toContain("rotate(180");
      expect(getSymbolSvg("dpad-up", pad), pad).toContain("rotate(270");
    }
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

describe("authoredBackgroundsFor — only tiles a Device can draw (#45, #62)", () => {
  it("offers the pads their shoulder tiles", () => {
    expect(authoredBackgroundsFor(["xbox"]).map((a) => a.id)).toEqual([
      "bumper",
      "trigger",
    ]);
    expect(authoredBackgroundsFor(["playstation"]).map((a) => a.id)).toEqual([
      "bumper",
      "trigger",
    ]);
  });

  it("offers the Keyboard none of them", () => {
    // `bumper` and `trigger` are authored by the pads and by nothing else, with
    // no shared drawing to fall back to, so a Keyboard Glyph asking for one
    // resolves to no art and draws the plain shape.
    expect(authoredBackgroundsFor(["keyboard"])).toEqual([]);
  });

  it("offers a mixed selection only what all of them draw", () => {
    // A Project-tier source applies to every Device, so a tile only the pad can
    // draw is still a broken promise to the Keyboard.
    expect(authoredBackgroundsFor(["keyboard", "xbox"])).toEqual([]);
    expect(
      authoredBackgroundsFor(["xbox", "playstation"]).map((a) => a.id),
    ).toEqual(["bumper", "trigger"]);
  });

  it("constrains nothing when no Device is named", () => {
    expect(authoredBackgroundsFor([])).toEqual(AUTHORED_BACKGROUNDS);
  });
});

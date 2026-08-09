import { describe, expect, it } from "vitest";
import {
  DEVICE_CATALOGS,
  catalogIndex,
  catalogNameIndex,
  defaultEnabledLabels,
  getCatalog,
} from "@/lib/glyph/catalog";
import {
  AUTHORED_BACKGROUNDS,
  SYMBOLS,
  getSymbolSvg,
} from "@/lib/glyph/symbols";

/**
 * The label lists the tool shipped before the Catalog model. The migrated model
 * must still seed exactly these Inputs, in this order, or generated output drifts
 * (see the parity test). Kept here as the frozen expectation.
 */
const LEGACY_KEYBOARD = [
  "W",
  "A",
  "S",
  "D",
  "Q",
  "E",
  "R",
  "F",
  "Space",
  "Shift",
  "Ctrl",
  "Alt",
  "Tab",
  "Enter",
  "Esc",
  "↑",
  "↓",
  "←",
  "→",
  "LMB",
  "RMB",
  "1",
  "2",
  "3",
];
const LEGACY_XBOX = [
  "A",
  "B",
  "X",
  "Y",
  "LB",
  "RB",
  "LT",
  "RT",
  "View",
  "Menu",
  "Left Stick",
  "Right Stick",
  "D-Pad Up",
  "D-Pad Down",
  "D-Pad Left",
  "D-Pad Right",
];
const LEGACY_PLAYSTATION = [
  "Cross",
  "Circle",
  "Square",
  "Triangle",
  "L1",
  "R1",
  "L2",
  "R2",
  "Share",
  "Options",
  "Left Stick",
  "Right Stick",
  "D-Pad Up",
  "D-Pad Down",
  "D-Pad Left",
  "D-Pad Right",
];

describe("DEVICE_CATALOGS", () => {
  it("ships a Catalog for keyboard, xbox, and playstation", () => {
    expect(DEVICE_CATALOGS.map((c) => c.id)).toEqual([
      "keyboard",
      "xbox",
      "playstation",
    ]);
  });

  it("gives every Catalog entry a unique, non-empty id", () => {
    for (const catalog of DEVICE_CATALOGS) {
      const ids = catalog.inputs.map((i) => i.id);
      expect(ids.every((id) => id.length > 0)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("lists every Default Selection id as a real Catalog entry", () => {
    for (const catalog of DEVICE_CATALOGS) {
      const ids = new Set(catalog.inputs.map((i) => i.id));
      for (const enabledId of catalog.defaultEnabled) {
        expect(ids.has(enabledId)).toBe(true);
      }
      // Default Selection ids themselves are unique.
      expect(new Set(catalog.defaultEnabled).size).toBe(
        catalog.defaultEnabled.length,
      );
    }
  });
});

describe("The Default Selection is the legacy default-enabled subset", () => {
  it("keyboard resolves to the ~24 legacy keys, in order", () => {
    expect(defaultEnabledLabels(getCatalog("keyboard")!)).toEqual(
      LEGACY_KEYBOARD,
    );
  });

  it("keyboard Catalog is larger than its Default Selection", () => {
    const keyboard = getCatalog("keyboard")!;
    expect(keyboard.inputs.length).toBeGreaterThan(
      keyboard.defaultEnabled.length,
    );
  });

  it("xbox enables the whole Catalog, in legacy order", () => {
    const xbox = getCatalog("xbox")!;
    expect(xbox.defaultEnabled.length).toBe(xbox.inputs.length);
    expect(defaultEnabledLabels(xbox)).toEqual(LEGACY_XBOX);
  });

  it("playstation enables the whole Catalog, in legacy order", () => {
    const ps = getCatalog("playstation")!;
    expect(ps.defaultEnabled.length).toBe(ps.inputs.length);
    expect(defaultEnabledLabels(ps)).toEqual(LEGACY_PLAYSTATION);
  });
});

describe("Well-known Inputs default to a Symbol (issue #17)", () => {
  function symbolOf(catalogId: string, inputId: string) {
    return catalogIndex(getCatalog(catalogId)!).get(inputId)?.symbolId;
  }

  it("maps Xbox face buttons and the menu cluster to their Symbols", () => {
    expect(symbolOf("xbox", "xbox-a")).toBe("a");
    expect(symbolOf("xbox", "xbox-y")).toBe("y");
    expect(symbolOf("xbox", "xbox-view")).toBe("view");
    expect(symbolOf("xbox", "xbox-menu")).toBe("menu");
  });

  it("maps PlayStation face buttons and the menu cluster to their Symbols", () => {
    expect(symbolOf("playstation", "ps-cross")).toBe("cross");
    expect(symbolOf("playstation", "ps-circle")).toBe("circle");
    expect(symbolOf("playstation", "ps-square")).toBe("square");
    expect(symbolOf("playstation", "ps-triangle")).toBe("triangle");
    expect(symbolOf("playstation", "ps-share")).toBe("share");
    expect(symbolOf("playstation", "ps-options")).toBe("options");
  });

  it("points both sticks at the shared stick Symbol", () => {
    expect(symbolOf("xbox", "xbox-left-stick")).toBe("stick");
    expect(symbolOf("xbox", "xbox-right-stick")).toBe("stick");
    expect(symbolOf("playstation", "ps-left-stick")).toBe("stick");
  });

  it("maps each d-pad direction to its rotated Symbol", () => {
    expect(symbolOf("xbox", "xbox-dpad-up")).toBe("dpad-up");
    expect(symbolOf("xbox", "xbox-dpad-right")).toBe("dpad-right");
  });

  it("names the same d-pad id on both pads, and resolves each to its own art", () => {
    // Ids are bare — the Device supplies the scope — so the shared name must not
    // mean shared art: each pad draws its own d-pad.
    expect(symbolOf("playstation", "ps-dpad-left")).toBe("dpad-left");
    expect(symbolOf("playstation", "ps-dpad-up")).toBe("dpad-up");
    const xbox = getSymbolSvg("dpad-up", "xbox");
    const ps = getSymbolSvg("dpad-up", "playstation");
    expect(xbox).toBeDefined();
    expect(ps).toBeDefined();
    expect(ps).not.toBe(xbox);
  });

  it("leaves bumper/trigger tiles Symbol-less (they default to a Background)", () => {
    expect(symbolOf("xbox", "xbox-lb")).toBeUndefined();
    expect(symbolOf("xbox", "xbox-rt")).toBeUndefined();
  });

  it("only references Symbol ids the manifest actually ships", () => {
    const shipped = new Set(SYMBOLS.map((s) => s.id));
    for (const catalog of DEVICE_CATALOGS) {
      for (const input of catalog.inputs) {
        if (input.symbolId) expect(shipped.has(input.symbolId)).toBe(true);
      }
    }
  });
});

describe("Shoulder Inputs carry cross-pad aliases", () => {
  const index = (id: string) => catalogIndex(getCatalog(id)!);

  it("gives each PlayStation shoulder its Xbox name", () => {
    expect(index("playstation").get("ps-r1")?.aliases).toContain("RB");
    expect(index("playstation").get("ps-r2")?.aliases).toContain("RT");
    expect(index("playstation").get("ps-l1")?.aliases).toContain("LB");
    expect(index("playstation").get("ps-l2")?.aliases).toContain("LT");
  });

  it("gives each Xbox shoulder its PlayStation name", () => {
    // An alias table is only useful both ways round.
    expect(index("xbox").get("xbox-rb")?.aliases).toContain("R1");
    expect(index("xbox").get("xbox-rt")?.aliases).toContain("R2");
    expect(index("xbox").get("xbox-lb")?.aliases).toContain("L1");
    expect(index("xbox").get("xbox-lt")?.aliases).toContain("L2");
  });

  it("resolves an Input by its label or any alias", () => {
    const ps = catalogNameIndex(getCatalog("playstation")!);
    expect(ps.get("R1")).toBe("ps-r1");
    expect(ps.get("RB")).toBe("ps-r1");
    expect(ps.get("Right Bumper")).toBe("ps-r1");
    expect(ps.get("nope")).toBeUndefined();
  });

  it("never lets an alias shadow another Input's real label", () => {
    // A label is the Input's identity; an alias is a convenience. If the two
    // ever collide the label has to win, or a name silently changes meaning.
    for (const catalog of DEVICE_CATALOGS) {
      const names = catalogNameIndex(catalog);
      for (const input of catalog.inputs)
        expect(names.get(input.label), input.label).toBe(input.id);
    }
  });
});

describe("Bumper/trigger Inputs seed an Authored Background (issue #18, ADR-0012 §2)", () => {
  function backgroundOf(catalogId: string, inputId: string) {
    return catalogIndex(getCatalog(catalogId)!).get(inputId)?.backgroundId;
  }

  it("seeds both Xbox bumpers with the bumper tile", () => {
    expect(backgroundOf("xbox", "xbox-lb")).toBe("bumper");
    expect(backgroundOf("xbox", "xbox-rb")).toBe("bumper");
  });

  it("seeds both Xbox triggers with the trigger tile", () => {
    expect(backgroundOf("xbox", "xbox-lt")).toBe("trigger");
    expect(backgroundOf("xbox", "xbox-rt")).toBe("trigger");
  });

  it("names the same tiles on PlayStation, resolving to its own shapes", () => {
    expect(backgroundOf("playstation", "ps-l1")).toBe("bumper");
    expect(backgroundOf("playstation", "ps-r1")).toBe("bumper");
    expect(backgroundOf("playstation", "ps-l2")).toBe("trigger");
    expect(backgroundOf("playstation", "ps-r2")).toBe("trigger");
    // A PlayStation L1 is not an Xbox bumper, so the shared id must not mean
    // shared art. Assert both are drawn before comparing, or "missing" passes.
    for (const id of ["bumper", "trigger"]) {
      const ps = getSymbolSvg(id, "playstation");
      const xbox = getSymbolSvg(id, "xbox");
      expect(ps, `${id} must be drawn for PlayStation`).toBeDefined();
      expect(xbox, `${id} must be drawn for Xbox`).toBeDefined();
      expect(ps, id).not.toBe(xbox);
    }
  });

  it("mirrors the left-side bumper/trigger so it faces opposite the right-side one", () => {
    function flipOf(catalogId: string, inputId: string) {
      return catalogIndex(getCatalog(catalogId)!).get(inputId)?.mirrored;
    }
    // Both sides share one right-facing tile; only the left ones are flipped.
    expect(flipOf("xbox", "xbox-lb")).toBe(true);
    expect(flipOf("xbox", "xbox-lt")).toBe(true);
    expect(flipOf("xbox", "xbox-rb")).toBeUndefined();
    expect(flipOf("xbox", "xbox-rt")).toBeUndefined();
    // The PlayStation tiles are authored right-facing too.
    expect(flipOf("playstation", "ps-l1")).toBe(true);
    expect(flipOf("playstation", "ps-l2")).toBe(true);
    expect(flipOf("playstation", "ps-r1")).toBeUndefined();
    expect(flipOf("playstation", "ps-r2")).toBeUndefined();
  });

  it("leaves face buttons unseeded", () => {
    expect(backgroundOf("xbox", "xbox-a")).toBeUndefined();
    expect(backgroundOf("playstation", "ps-cross")).toBeUndefined();
  });

  it("seeds every stick with no Background at all", () => {
    // `null` is not `undefined`: the stick Symbol draws its own ring, so these
    // are seeded *bare* rather than left to fall through to the Project base.
    for (const id of ["xbox-left-stick", "xbox-right-stick"])
      expect(backgroundOf("xbox", id), id).toBeNull();
    for (const id of ["ps-left-stick", "ps-right-stick"])
      expect(backgroundOf("playstation", id), id).toBeNull();
  });

  it("never mirrors an Input that seeds no tile", () => {
    // `mirrored` orients a seeded tile and means nothing without one, so the two
    // fields must not drift apart into a flag that points at nothing.
    for (const catalog of DEVICE_CATALOGS) {
      for (const input of catalog.inputs) {
        if (input.mirrored)
          expect(typeof input.backgroundId, input.id).toBe("string");
      }
    }
  });

  it("only references Authored Background ids the manifest actually ships", () => {
    const shipped = new Set(AUTHORED_BACKGROUNDS.map((b) => b.id));
    for (const catalog of DEVICE_CATALOGS) {
      for (const input of catalog.inputs) {
        // `null` names no tile to look up — it is the seeded absence of one.
        if (typeof input.backgroundId === "string")
          expect(shipped.has(input.backgroundId), input.id).toBe(true);
      }
    }
  });
});

describe("Catalog lookup", () => {
  it("finds a Catalog by id", () => {
    expect(getCatalog("xbox")?.name).toBe("Xbox");
    expect(getCatalog("nope")).toBeUndefined();
  });
});

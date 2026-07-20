import { describe, expect, it } from "vitest";
import {
  DEVICE_CATALOGS,
  catalogPresetLabels,
  getCatalog,
  getCatalogByName,
} from "@/lib/glyph/catalog";

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

  it("lists every preset id as a real Catalog entry", () => {
    for (const catalog of DEVICE_CATALOGS) {
      const ids = new Set(catalog.inputs.map((i) => i.id));
      for (const presetId of catalog.preset) {
        expect(ids.has(presetId)).toBe(true);
      }
      // Preset ids themselves are unique.
      expect(new Set(catalog.preset).size).toBe(catalog.preset.length);
    }
  });
});

describe("Presets seed the legacy default-enabled subset", () => {
  it("keyboard preset resolves to the ~24 legacy keys, in order", () => {
    expect(catalogPresetLabels(getCatalog("keyboard")!)).toEqual(
      LEGACY_KEYBOARD,
    );
  });

  it("keyboard Catalog is larger than its enabled preset", () => {
    const keyboard = getCatalog("keyboard")!;
    expect(keyboard.inputs.length).toBeGreaterThan(keyboard.preset.length);
  });

  it("xbox preset enables the whole Catalog, in legacy order", () => {
    const xbox = getCatalog("xbox")!;
    expect(xbox.preset.length).toBe(xbox.inputs.length);
    expect(catalogPresetLabels(xbox)).toEqual(LEGACY_XBOX);
  });

  it("playstation preset enables the whole Catalog, in legacy order", () => {
    const ps = getCatalog("playstation")!;
    expect(ps.preset.length).toBe(ps.inputs.length);
    expect(catalogPresetLabels(ps)).toEqual(LEGACY_PLAYSTATION);
  });
});

describe("Catalog lookup", () => {
  it("finds a Catalog by id", () => {
    expect(getCatalog("xbox")?.name).toBe("Xbox");
    expect(getCatalog("nope")).toBeUndefined();
  });

  it("finds a Catalog by Device name (for migration)", () => {
    expect(getCatalogByName("PlayStation")?.id).toBe("playstation");
    expect(getCatalogByName("Unknown Device")).toBeUndefined();
  });
});

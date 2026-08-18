import { describe, expect, it } from "vitest";
import { PRESETS, getPreset } from "@/lib/glyph/presets";

/**
 * The shipped set is validated by the build gate (`presets/build-presets.mts`)
 * and typed by `tsc`, so these pin only what neither can say: that the picker's
 * list is coherent, and that each species covers the Devices its shape promises.
 */
describe("shipped Presets", () => {
  it("has unique ids and a non-empty label per Preset", () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of PRESETS)
      expect(preset.label.length, preset.id).toBeGreaterThan(0);
  });

  it("gives a Device Preset exactly one Device and no Project tier", () => {
    for (const preset of PRESETS.filter((p) => p.kind === "device")) {
      expect(preset.devices.length, preset.id).toBe(1);
      expect("style" in preset, preset.id).toBe(false);
    }
  });

  it("ships both species, so the picker holds one set and not two", () => {
    expect(new Set(PRESETS.map((p) => p.kind))).toEqual(
      new Set(["device", "project"]),
    );
  });

  it("finds a Preset by id", () => {
    expect(getPreset("xbox-neon")?.label).toBe("Neon");
    expect(getPreset("nope")).toBeUndefined();
  });
});

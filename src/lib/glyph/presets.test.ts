import { describe, expect, it } from "vitest";
import { createDefaultProject } from "@/lib/glyph/defaults";
import {
  PRESETS,
  defaultTakenDevices,
  getPreset,
  previewPreset,
  type Preset,
} from "@/lib/glyph/presets";
import { projectReducer } from "@/lib/glyph/project";

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

/** A Preset covering the Keyboard (which a fresh project has) and Xbox (which it doesn't). */
function twoDevicePreset(): Preset {
  return {
    id: "two",
    label: "Two",
    kind: "device",
    devices: [
      { catalogId: "keyboard", style: {}, glyphStyles: {} },
      { catalogId: "xbox", style: {}, glyphStyles: {} },
    ],
  };
}

describe("which Devices a Preset takes by default (ADR-0012 §4)", () => {
  it("takes the Devices you lack and leaves the ones you have", () => {
    // Asymmetric on purpose: adding a Device costs nothing, while replacing a
    // curated selection is the most expensive thing the picker can do.
    expect(
      defaultTakenDevices(createDefaultProject(), twoDevicePreset()),
    ).toEqual(["xbox"]);
  });
});

describe("the preview project the pane draws (ADR-0012 §4)", () => {
  it("materialises a covered Device you lack even when it isn't taken", () => {
    const preview = previewPreset(
      createDefaultProject(),
      twoDevicePreset(),
      [],
    );
    expect(preview.devices.map((d) => d.catalogId)).toEqual([
      "keyboard",
      "xbox",
    ]);
  });

  it("keeps your selection on a Device you have and did not take", () => {
    const edited = projectReducer(createDefaultProject(), {
      type: "toggle-input",
      deviceIndex: 0,
      inputId: "key-space",
    });
    const preview = previewPreset(edited, twoDevicePreset(), []);
    expect(preview.devices[0].enabled).toEqual(edited.devices[0].enabled);
  });

  it("shows the Default Selection on a Device you took", () => {
    const edited = projectReducer(createDefaultProject(), {
      type: "toggle-input",
      deviceIndex: 0,
      inputId: "key-space",
    });
    const preview = previewPreset(edited, twoDevicePreset(), ["keyboard"]);
    expect(preview.devices[0].enabled).toEqual(
      createDefaultProject().devices[0].enabled,
    );
  });
});

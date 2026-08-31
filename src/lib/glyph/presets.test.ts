import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE, createDefaultProject } from "@/lib/glyph/defaults";
import {
  PRESETS,
  defaultTakenDevices,
  getPreset,
  previewPreset,
  type Preset,
} from "@/lib/glyph/presets";
import { projectReducer } from "@/lib/glyph/project";
import { resolveDeviceInputs } from "@/lib/glyph/generate";

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
    expect(getPreset("xbox-brand")?.label).toBe("Brand");
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

/**
 * The one shipped Preset whose *values* are the point (#75): A green, B red, X
 * cyan, Y yellow on black letters, and nothing above would notice those turning
 * into four greys. Read through the cascade rather than off the payload,
 * because the look is a resolution and not a literal.
 */
describe("the Xbox brand palette", () => {
  const FACE_BUTTONS: Record<string, { disc: string; letter: string }> = {
    "xbox-a": { disc: "#3cdb4e", letter: "#000000" },
    "xbox-b": { disc: "#d04242", letter: "#000000" },
    "xbox-x": { disc: "#40ccd0", letter: "#000000" },
    "xbox-y": { disc: "#ecdb33", letter: "#000000" },
  };

  /** The Preset applied to a fresh project, resolved Input by Input. */
  function resolvedInputsById() {
    const preset = getPreset("xbox-brand")!;
    const project = previewPreset(createDefaultProject(), preset, ["xbox"]);
    const device = project.devices.find((d) => d.catalogId === "xbox")!;
    return new Map(
      resolveDeviceInputs(device, project).map((input) => [input.id, input]),
    );
  }

  it("paints every face button its brand colour, on a bare circle", () => {
    const inputs = resolvedInputsById();
    for (const [id, { disc, letter }] of Object.entries(FACE_BUTTONS)) {
      const { background, foreground } = inputs.get(id)!.style;
      // A face button has no Catalog backer, so it takes the device-wide circle.
      expect(background.source, id).toEqual({ kind: "shape" });
      expect(background.shape, id).toBe("circle");
      expect(background.fill, id).toBe(disc);
      expect(background.border.width, id).toBe(0);
      expect(foreground.symbolPaints.fill, id).toBe(letter);
    }
  });

  it("leaves every shoulder its authored backer, which outranks the circle", () => {
    const inputs = resolvedInputsById();
    for (const id of ["xbox-lb", "xbox-rb", "xbox-lt", "xbox-rt"]) {
      expect(inputs.get(id)!.style.background.source, id).toMatchObject({
        kind: "authored",
      });
    }
  });

  it("repaints nothing it doesn't name, so a project's own look survives", () => {
    const inputs = resolvedInputsById();
    const dpad = inputs.get("xbox-dpad-up")!.style;
    expect(dpad.background.fill).toBe(DEFAULT_STYLE.background.fill);
    expect(dpad.foreground.symbolPaints).toEqual(
      DEFAULT_STYLE.foreground.symbolPaints,
    );
  });
});

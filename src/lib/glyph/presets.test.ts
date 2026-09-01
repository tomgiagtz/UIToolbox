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

/** `presetId` applied to a fresh project, resolved Input by Input. */
function resolvedInputsById(presetId: string, catalogId: string) {
  const preset = getPreset(presetId)!;
  const project = previewPreset(createDefaultProject(), preset, [catalogId]);
  const device = project.devices.find((d) => d.catalogId === catalogId)!;
  return new Map(
    resolveDeviceInputs(device, project).map((input) => [input.id, input]),
  );
}

/**
 * The shipped Presets whose *values* are the point (#75): the pad palettes,
 * which nothing above would notice turning into a set of greys. Read through
 * the cascade rather than off the payload, because the look is a resolution and
 * not a literal — a face button has no Catalog backer, so the disc it lands on
 * is the Device tier's circle, while a shoulder's authored tile outranks that
 * tier and stays.
 */
describe("the Xbox brand palette", () => {
  /** Each face button's disc colour; the letter over it is always black. */
  const DISCS: Record<string, string> = {
    "xbox-a": "#3cdb4e",
    "xbox-b": "#d04242",
    "xbox-x": "#40ccd0",
    "xbox-y": "#ecdb33",
  };

  it("paints every face button its brand colour, on a bare circle", () => {
    const inputs = resolvedInputsById("xbox-brand", "xbox");
    for (const [id, disc] of Object.entries(DISCS)) {
      const { background, foreground } = inputs.get(id)!.style;
      expect(background.source, id).toEqual({ kind: "shape" });
      expect(background.shape, id).toBe("circle");
      expect(background.fill, id).toBe(disc);
      expect(background.border.width, id).toBe(0);
      expect(foreground.symbolPaints.fill, id).toBe("#000000");
    }
  });

  it("leaves every shoulder its authored backer, which outranks the circle", () => {
    const inputs = resolvedInputsById("xbox-brand", "xbox");
    for (const id of ["xbox-lb", "xbox-rb", "xbox-lt", "xbox-rt"]) {
      expect(inputs.get(id)!.style.background.source, id).toMatchObject({
        kind: "authored",
      });
    }
  });

  it("repaints nothing it doesn't name, so a project's own look survives", () => {
    const dpad = resolvedInputsById("xbox-brand", "xbox").get("xbox-dpad-up")!;
    expect(dpad.style.background.fill).toBe(DEFAULT_STYLE.background.fill);
    expect(dpad.style.foreground.symbolPaints).toEqual(
      DEFAULT_STYLE.foreground.symbolPaints,
    );
  });
});

/**
 * PlayStation is the same recipe read the other way round: the shapes *are* the
 * brand, so the colour lands on the Symbol and the disc keeps whatever fill the
 * project had — which is why this palette names no disc colour at all.
 */
describe("the PlayStation shape palette", () => {
  /** Each face button's Symbol colour, drawn on the project's own disc. */
  const SHAPES: Record<string, string> = {
    "ps-triangle": "#3ee3a1",
    "ps-circle": "#ff6666",
    "ps-cross": "#7db3e9",
    "ps-square": "#ff69f8",
  };

  it("paints every shape its brand colour, on a bare circle", () => {
    const inputs = resolvedInputsById("ps-brand", "playstation");
    for (const [id, shape] of Object.entries(SHAPES)) {
      const { background, foreground } = inputs.get(id)!.style;
      expect(background.shape, id).toBe("circle");
      expect(background.border.width, id).toBe(0);
      expect(background.fill, id).toBe(DEFAULT_STYLE.background.fill);
      expect(foreground.symbolPaints.fill, id).toBe(shape);
    }
  });

  it("leaves every shoulder its authored backer, which outranks the circle", () => {
    const inputs = resolvedInputsById("ps-brand", "playstation");
    for (const id of ["ps-l1", "ps-r1", "ps-l2", "ps-r2"]) {
      expect(inputs.get(id)!.style.background.source, id).toMatchObject({
        kind: "authored",
      });
    }
  });

  it("repaints nothing it doesn't name, so a project's own look survives", () => {
    const dpad = resolvedInputsById("ps-brand", "playstation").get(
      "ps-dpad-up",
    )!;
    expect(dpad.style.foreground.symbolPaints).toEqual(
      DEFAULT_STYLE.foreground.symbolPaints,
    );
  });
});

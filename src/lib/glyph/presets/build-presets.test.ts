import { describe, expect, it } from "vitest";
import {
  buildPreset,
  buildPresets,
  type PresetEntry,
} from "./build-presets.mts";
import { DEFAULT_STYLE } from "@/lib/glyph/defaults";
import type { StyleOverride } from "@/lib/glyph/style";
import type { DeviceConfig, Project } from "@/lib/glyph/types";

/**
 * The build gate is the *only* place a shipped Preset is validated (ADR-0012
 * §5): after it, the payload is a typed constant `tsc` checks. So these cover
 * both halves of it — what the projection keeps and drops, and every rule it
 * throws on.
 */

/** A Device as the tool exports one: selection, custom Inputs, and both tiers. */
function device(overrides: Partial<DeviceConfig> = {}): DeviceConfig {
  return {
    name: "Xbox",
    catalogId: "xbox",
    enabled: ["xbox-a", "xbox-b"],
    custom: [{ id: "custom-1", label: "Paddle" }],
    style: { background: { fill: "#0ff" } },
    glyphStyles: { "xbox-a": { foreground: { textColor: "#f0f" } } },
    ...overrides,
  };
}

/** A raw tool export — every field, including the ones a Preset may not carry. */
function exportedProject(overrides: Partial<Project> = {}): Project {
  return {
    name: "neon",
    style: structuredClone(DEFAULT_STYLE),
    fonts: [],
    images: [],
    sets: [],
    devices: [device()],
    exportSettings: {
      cellSize: 256,
      naming: {
        template: "{device}_{input}",
        filenameTemplate: "{device}_atlas",
        case: "snake",
      },
    },
    ...overrides,
  };
}

const DEVICE_ENTRY: PresetEntry = {
  id: "neon",
  label: "Neon",
  kind: "device",
  source: "neon.json",
  catalogId: "xbox",
};

const PROJECT_ENTRY: PresetEntry = {
  id: "arcade",
  label: "Arcade",
  kind: "project",
  source: "arcade.json",
};

/** An export whose one Device carries exactly these Glyph-tier overrides. */
function withGlyphStyle(styles: Record<string, StyleOverride>): Project {
  return exportedProject({ devices: [device({ glyphStyles: styles })] });
}

describe("projecting a Device Preset", () => {
  it("lifts out the named Device and nothing else", () => {
    expect(buildPreset(DEVICE_ENTRY, exportedProject())).toEqual({
      id: "neon",
      label: "Neon",
      kind: "device",
      devices: [
        {
          catalogId: "xbox",
          style: { background: { fill: "#0ff" } },
          glyphStyles: { "xbox-a": { foreground: { textColor: "#f0f" } } },
        },
      ],
    });
  });

  it("drops the export's name, selection, custom Inputs and export settings", () => {
    const json = JSON.stringify(buildPreset(DEVICE_ENTRY, exportedProject()));
    for (const forbidden of ["name", "enabled", "custom", "cellSize", "naming"])
      expect(json, forbidden).not.toContain(`"${forbidden}"`);
  });

  it("carries no Project tier — a Device Preset writes one Device", () => {
    expect("style" in buildPreset(DEVICE_ENTRY, exportedProject())).toBe(false);
  });

  it("throws when the export has no Device for the manifest's catalogId", () => {
    const source = exportedProject({
      devices: [device({ catalogId: "playstation" })],
    });
    expect(() => buildPreset(DEVICE_ENTRY, source)).toThrow(/xbox/);
  });

  it("throws when the entry names no catalogId to lift out", () => {
    const entry = { ...DEVICE_ENTRY, catalogId: undefined };
    expect(() => buildPreset(entry, exportedProject())).toThrow(/catalogId/);
  });
});

describe("projecting a Project Preset", () => {
  it("keeps the Project tier and every Device it covers", () => {
    const source = exportedProject({
      devices: [
        device(),
        device({
          name: "Keyboard",
          catalogId: "keyboard",
          glyphStyles: { "key-w": { background: { fill: "#123" } } },
        }),
      ],
    });
    const preset = buildPreset(PROJECT_ENTRY, source);
    expect(preset.kind).toBe("project");
    expect(preset).toHaveProperty("style", DEFAULT_STYLE);
    expect(preset.devices.map((d) => d.catalogId)).toEqual([
      "xbox",
      "keyboard",
    ]);
  });

  it("throws when the entry names a catalogId it cannot use", () => {
    // Only a Device Preset lifts one Device out, so a catalogId here would read
    // as a scope the projection silently ignores.
    const entry = { ...PROJECT_ENTRY, catalogId: "xbox" };
    expect(() => buildPreset(entry, exportedProject())).toThrow(/catalogId/);
  });
});

describe("the gate", () => {
  it("throws on an unknown catalogId", () => {
    const source = exportedProject({ devices: [device({ catalogId: "n64" })] });
    expect(() => buildPreset(PROJECT_ENTRY, source)).toThrow(/n64/);
  });

  it("throws on a glyphStyles key that isn't a Catalog Input", () => {
    const source = withGlyphStyle({ "xbox-z": {} });
    expect(() => buildPreset(DEVICE_ENTRY, source)).toThrow(/xbox-z/);
  });

  it("throws on a glyphStyles key that is a custom Input id", () => {
    // Custom Inputs don't survive projection, so a style keyed by one would
    // land on nothing in every project but the author's.
    const source = withGlyphStyle({ "custom-1": {} });
    expect(() => buildPreset(DEVICE_ENTRY, source)).toThrow(/custom-1/);
  });

  it("throws on an imageId in a Background source", () => {
    const source = withGlyphStyle({
      "xbox-a": { background: { source: { kind: "image", imageId: "img-1" } } },
    });
    expect(() => buildPreset(DEVICE_ENTRY, source)).toThrow(/imageId/);
  });

  it("throws on an imageId in a tier the projection would have dropped", () => {
    // Bytes are read on the *export*, not the projection: a Device Preset drops
    // every Device but one, so an illegal source would otherwise ship clean and
    // its author would never hear that what they committed was illegal.
    const source = exportedProject({
      devices: [
        device(),
        device({
          catalogId: "keyboard",
          glyphStyles: {
            "key-w": {
              foreground: { renderSource: { kind: "image", imageId: "img-1" } },
            },
          },
        }),
      ],
    });
    expect(() => buildPreset(DEVICE_ENTRY, source)).toThrow(/imageId/);
  });

  it("throws on an export that uploaded custom images at all", () => {
    const source = exportedProject({
      images: [{ id: "img-1", fileName: "tile.png", type: "image/png" }],
    });
    expect(() => buildPreset(DEVICE_ENTRY, source)).toThrow(/images/);
  });

  it("throws on an imageId in a Render Source override", () => {
    const source = withGlyphStyle({
      "xbox-a": {
        foreground: { renderSource: { kind: "image", imageId: "img-1" } },
      },
    });
    expect(() => buildPreset(DEVICE_ENTRY, source)).toThrow(/imageId/);
  });

  it("throws on a backgroundId that isn't a shipped Authored Background", () => {
    const source = withGlyphStyle({
      "xbox-a": {
        background: { source: { kind: "authored", backgroundId: "hexagon" } },
      },
    });
    expect(() => buildPreset(DEVICE_ENTRY, source)).toThrow(/hexagon/);
  });

  it("accepts a shipped Authored Background", () => {
    const source = withGlyphStyle({
      "xbox-a": {
        background: { source: { kind: "authored", backgroundId: "bumper" } },
      },
    });
    expect(() => buildPreset(DEVICE_ENTRY, source)).not.toThrow();
  });

  it("throws on a font family that isn't bundled", () => {
    const source = withGlyphStyle({
      "xbox-a": { foreground: { fontFamily: "UITBFont-1712-ab" } },
    });
    expect(() => buildPreset(DEVICE_ENTRY, source)).toThrow(/UITBFont/);
  });

  it("checks the Project tier's font too", () => {
    const style = structuredClone(DEFAULT_STYLE);
    style.foreground.fontFamily = "Comic Sans MS";
    const source = exportedProject({ style });
    expect(() => buildPreset(PROJECT_ENTRY, source)).toThrow(/Comic Sans MS/);
  });

  it("accepts every bundled family", () => {
    const source = withGlyphStyle({
      "xbox-a": { foreground: { fontFamily: "Titan One" } },
    });
    expect(() => buildPreset(DEVICE_ENTRY, source)).not.toThrow();
  });

  it("canonicalises rotations into −180…180 as it writes them", () => {
    const source = withGlyphStyle({
      "xbox-a": { background: { transform: { rotation: 450 } } },
    });
    const preset = buildPreset(DEVICE_ENTRY, source);
    expect(
      preset.devices[0].glyphStyles["xbox-a"].background?.transform?.rotation,
    ).toBe(90);
  });
});

describe("the manifest", () => {
  const read = () => exportedProject();

  it("builds every entry, in manifest order — the picker's order", () => {
    const entries = [PROJECT_ENTRY, { ...DEVICE_ENTRY, id: "second" }];
    expect(buildPresets(entries, read).map((p) => p.id)).toEqual([
      "arcade",
      "second",
    ]);
  });

  it("throws on a row whose kind is no species", () => {
    // `manifest.mjs` is a `.mjs`, so its rows arrive unchecked by `tsc`.
    const entry = { ...DEVICE_ENTRY, kind: "Device" } as unknown as PresetEntry;
    expect(() => buildPresets([entry], read)).toThrow(/Device/);
  });

  it("throws on a row missing its source file", () => {
    const entry = { ...DEVICE_ENTRY, source: "" };
    expect(() => buildPresets([entry], read)).toThrow(/source/);
  });

  it("throws on a duplicate id", () => {
    expect(() => buildPresets([DEVICE_ENTRY, DEVICE_ENTRY], read)).toThrow(
      /neon/,
    );
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, parseConfig, saveConfig } from "@/lib/glyph/project-store";
import {
  DEFAULT_SYMBOL_PAINTS,
  createDefaultProject,
} from "@/lib/glyph/presets";
import { projectReducer } from "@/lib/glyph/project";
import type { Project } from "@/lib/glyph/types";

function edited(): Project {
  // A project that differs from the default across every persisted axis, so a
  // faithful round-trip has to carry each one.
  return [
    { type: "set-font", family: "UITBFont-restored" } as const,
    {
      type: "patch-style",
      scope: { tier: "project" },
      patch: { textColor: "#ff0000", background: { shape: "circle" } },
    } as const,
    { type: "set-cell-size", size: 256 } as const,
    { type: "toggle-device", catalogId: "xbox" } as const,
    { type: "add-custom-input", deviceIndex: 0, label: "F5" } as const,
    { type: "set-naming-template", template: "btn_{input}" } as const,
    { type: "set-naming-case", case: "kebab" } as const,
    { type: "set-filename-template", template: "atlas_{device}" } as const,
  ].reduce(projectReducer, createDefaultProject(""));
}

describe("ProjectStore — config (localStorage)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("returns null when nothing has been saved", () => {
    expect(loadConfig()).toBeNull();
  });

  it("round-trips a full project through save/load", () => {
    const project = edited();
    saveConfig(project);
    expect(loadConfig()).toEqual(project);
  });

  it("overwrites the previous save", () => {
    saveConfig(createDefaultProject("first"));
    const project = edited();
    saveConfig(project);
    expect(loadConfig()).toEqual(project);
  });

  it("returns null for malformed JSON rather than throwing", () => {
    localStorage.setItem("uitoolbox.glyph-creator.project", "{ not json");
    expect(loadConfig()).toBeNull();
  });

  it("returns null for a structurally-invalid payload", () => {
    localStorage.setItem(
      "uitoolbox.glyph-creator.project",
      JSON.stringify({ version: 1, project: { nope: true } }),
    );
    expect(loadConfig()).toBeNull();
  });

  it("returns null for an unknown schema version", () => {
    localStorage.setItem(
      "uitoolbox.glyph-creator.project",
      JSON.stringify({ version: 999, project: edited() }),
    );
    expect(loadConfig()).toBeNull();
  });
});

describe("ProjectStore — v2 → v3 migration (symbolPaints)", () => {
  // A v2 config: the Catalog + Style Cascade shape, but before the Project gained
  // its `symbolPaints` base tier (ADR-0007 §3).
  function v2(): string {
    return JSON.stringify({
      version: 2,
      project: {
        name: "pre-symbol-paints",
        font: { family: "Inter" },
        textColor: "#f8fafc",
        background: {
          shape: "rounded-rect",
          fill: "#1e293b",
          cornerRadius: 18,
          border: { width: 4, color: "#475569" },
        },
        cellSize: 128,
        devices: [
          {
            name: "Keyboard",
            catalogId: "keyboard",
            enabled: ["key-w"],
            custom: [],
            style: {},
            glyphStyles: {},
          },
        ],
        naming: { template: "{device}_{input}", case: "snake" },
        filenameTemplate: "{device}_atlas",
      },
    });
  }

  it("backfills the default Symbol Paint Role colours", () => {
    const project = parseConfig(v2());
    expect(project).not.toBeNull();
    expect(project!.symbolPaints).toEqual(DEFAULT_SYMBOL_PAINTS);
    // The rest of the project is carried through untouched.
    expect(project!.devices[0].enabled).toEqual(["key-w"]);
  });

  it("produces a config that passes current-version validation on re-save", () => {
    const migrated = parseConfig(v2())!;
    saveConfig(migrated);
    expect(loadConfig()).toEqual(migrated);
  });
});

describe("ProjectStore — v1 → v2 migration", () => {
  // A v1 config: Devices were a flat list of Input label strings.
  function v1(devices: { name: string; inputs: string[] }[]): string {
    return JSON.stringify({
      version: 1,
      project: {
        name: "legacy",
        font: { family: "Inter" },
        textColor: "#f8fafc",
        background: {
          shape: "rounded-rect",
          fill: "#1e293b",
          cornerRadius: 18,
          border: { width: 4, color: "#475569" },
        },
        cellSize: 128,
        devices,
        naming: { template: "{device}_{input}", case: "snake" },
        filenameTemplate: "{device}_atlas",
      },
    });
  }

  it("maps Catalog-matching labels to enabled ids and the rest to custom", () => {
    const project = parseConfig(
      v1([{ name: "Keyboard", inputs: ["W", "A", "MyKey"] }]),
    );
    expect(project).not.toBeNull();
    const [kb] = project!.devices;
    expect(kb.catalogId).toBe("keyboard");
    expect(kb.enabled).toEqual(["key-w", "key-a"]);
    expect(kb.custom).toEqual([{ id: "custom-1", label: "MyKey" }]);
    expect(kb.style).toEqual({});
    expect(kb.glyphStyles).toEqual({});
    // v1 → v2 → v3 also backfills the Symbol Paint Role defaults.
    expect(project!.symbolPaints).toEqual(DEFAULT_SYMBOL_PAINTS);
  });

  it("migrates a full pad Device to its enabled Catalog ids", () => {
    const project = parseConfig(
      v1([{ name: "Xbox", inputs: ["A", "B", "LB"] }]),
    );
    expect(project!.devices[0].enabled).toEqual([
      "xbox-a",
      "xbox-b",
      "xbox-lb",
    ]);
    expect(project!.devices[0].custom).toEqual([]);
  });

  it("produces a config that passes current-version validation on re-save", () => {
    const migrated = parseConfig(v1([{ name: "Keyboard", inputs: ["W"] }]))!;
    saveConfig(migrated);
    // Round-trips through the v2 validator without another migration.
    expect(loadConfig()).toEqual(migrated);
  });
});

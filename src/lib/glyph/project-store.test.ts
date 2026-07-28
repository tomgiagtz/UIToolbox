import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, parseConfig, saveConfig } from "@/lib/glyph/project-store";
import {
  DEFAULT_CONTENT_SCALE,
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

describe("ProjectStore — v4 → v5 migration (Background source union)", () => {
  // A v4 config: before the Background named its tile art with a `source` union,
  // it carried an optional `backgroundId` + `flipX` pair — and, inside a sparse
  // override, a `null` id meaning "no tile, draw the shape" (issue #22).
  function v4(
    background: Record<string, unknown>,
    device: object = {},
  ): string {
    return JSON.stringify({
      version: 4,
      project: {
        name: "pre-source",
        font: { family: "Inter" },
        textColor: "#f8fafc",
        background: {
          shape: "rounded-rect",
          fill: "#1e293b",
          cornerRadius: 18,
          border: { width: 4, color: "#475569" },
          ...background,
        },
        symbolPaints: DEFAULT_SYMBOL_PAINTS,
        contentScale: 1,
        images: [],
        cellSize: 128,
        devices: [
          {
            name: "Xbox",
            catalogId: "xbox",
            enabled: ["xbox-lb"],
            custom: [],
            style: {},
            glyphStyles: {},
            ...device,
          },
        ],
        naming: { template: "{device}_{input}", case: "snake" },
        filenameTemplate: "{device}_atlas",
      },
    });
  }

  it("gives a tile-less Background the plain shape source", () => {
    const project = parseConfig(v4({}))!;
    expect(project.background.source).toEqual({ kind: "shape" });
    // Nothing else about the Background moves.
    expect(project.background.shape).toBe("rounded-rect");
    expect(project.background.cornerRadius).toBe(18);
  });

  it("rewrites a saved Authored Background, mirror flag and all", () => {
    const project = parseConfig(v4({ backgroundId: "bumper", flipX: true }))!;
    expect(project.background.source).toEqual({
      kind: "authored",
      backgroundId: "bumper",
      flipX: true,
    });
  });

  it("rewrites Device and per-Glyph overrides too", () => {
    const project = parseConfig(
      v4(
        {},
        {
          style: { background: { backgroundId: "trigger", fill: "#111111" } },
          glyphStyles: {
            // The pre-v5 spelling of "no tile — draw the shape".
            "xbox-lb": { background: { backgroundId: null, shape: "circle" } },
          },
        },
      ),
    )!;
    const device = project.devices[0];
    expect(device.style.background).toEqual({
      source: { kind: "authored", backgroundId: "trigger" },
      fill: "#111111",
    });
    expect(device.glyphStyles["xbox-lb"].background).toEqual({
      source: { kind: "shape" },
      shape: "circle",
    });
  });

  it("leaves an override that never named a tile alone", () => {
    const project = parseConfig(
      v4({}, { style: { background: { shape: "circle" } } }),
    )!;
    // Still sparse: an unset source falls up the cascade, so it must not be
    // backfilled with an explicit "shape" that would outrank the Catalog tier.
    expect(project.devices[0].style.background).toEqual({ shape: "circle" });
  });

  it("drops a mirror flag that never named a tile", () => {
    const project = parseConfig(
      v4({}, { style: { background: { flipX: true, shape: "circle" } } }),
    )!;
    // `flipX` only ever meant something beside a `backgroundId`. With no id to
    // describe, v5 has nowhere to keep it — and it must not linger as a field
    // `BackgroundOverride` no longer has.
    expect(project.devices[0].style.background).toEqual({ shape: "circle" });
  });

  it("produces a config that passes current-version validation on re-save", () => {
    const migrated = parseConfig(v4({ backgroundId: "bumper" }))!;
    saveConfig(migrated);
    expect(loadConfig()).toEqual(migrated);
  });

  it("rejects a current-version config whose Background source is malformed", () => {
    const bad = JSON.stringify({
      version: 5,
      project: {
        ...JSON.parse(v4({})).project,
        background: {
          shape: "circle",
          fill: "#111111",
          cornerRadius: 0,
          border: { width: 0, color: "#000000" },
          source: { kind: "authored" },
        },
      },
    });
    expect(parseConfig(bad)).toBeNull();
  });
});

describe("ProjectStore — v3 → v4 migration (content scale + images)", () => {
  // A v3 config: before the Project gained a content scale and an image manifest
  // (issue #20).
  function v3(over: Record<string, unknown> = {}): string {
    return JSON.stringify({
      version: 3,
      project: {
        name: "pre-images",
        font: { family: "Inter" },
        textColor: "#f8fafc",
        background: {
          shape: "rounded-rect",
          fill: "#1e293b",
          cornerRadius: 18,
          border: { width: 4, color: "#475569" },
        },
        symbolPaints: DEFAULT_SYMBOL_PAINTS,
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
        ...over,
      },
    });
  }

  it("backfills the unscaled content default and an empty image manifest", () => {
    const project = parseConfig(v3());
    expect(project).not.toBeNull();
    expect(project!.contentScale).toBe(DEFAULT_CONTENT_SCALE);
    expect(project!.images).toEqual([]);
    // The rest of the project is carried through untouched.
    expect(project!.devices[0].enabled).toEqual(["key-w"]);
  });

  it("produces a config that passes current-version validation on re-save", () => {
    const migrated = parseConfig(v3())!;
    saveConfig(migrated);
    expect(loadConfig()).toEqual(migrated);
  });

  it("rejects a current-version config whose image manifest is malformed", () => {
    const bad = JSON.stringify({
      version: 4,
      project: JSON.parse(v3({ contentScale: 1, images: [{ id: 7 }] })).project,
    });
    expect(parseConfig(bad)).toBeNull();
  });

  it("round-trips an image manifest and a scaled Glyph", () => {
    const project: Project = {
      ...createDefaultProject(""),
      contentScale: 0.75,
      images: [{ id: "img-1.png", fileName: "art.png", type: "image/png" }],
    };
    saveConfig(project);
    expect(loadConfig()).toEqual(project);
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

  it("matches a shoulder Input written in the other pad's vocabulary", () => {
    // A v1 project listed Inputs by label only. Someone who wrote "RB" on a
    // PlayStation Device meant R1, so the alias should recover the Catalog
    // Input instead of stranding it as a custom Input.
    const project = parseConfig(
      v1([{ name: "PlayStation", inputs: ["RB", "R2"] }]),
    );
    expect(project!.devices[0].enabled).toEqual(["ps-r1", "ps-r2"]);
    expect(project!.devices[0].custom).toEqual([]);
  });

  it("produces a config that passes current-version validation on re-save", () => {
    const migrated = parseConfig(v1([{ name: "Keyboard", inputs: ["W"] }]))!;
    saveConfig(migrated);
    // Round-trips through the v2 validator without another migration.
    expect(loadConfig()).toEqual(migrated);
  });
});

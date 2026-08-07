import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, parseConfig, saveConfig } from "@/lib/glyph/project-store";
import { DEFAULT_FONT_FAMILY, createDefaultProject } from "@/lib/glyph/presets";
import { projectReducer } from "@/lib/glyph/project";
import type { Project } from "@/lib/glyph/types";

const CONFIG_KEY = "uitoolbox.glyph-creator.project";

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
  ].reduce(projectReducer, createDefaultProject());
}

describe("ProjectStore — config (localStorage)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("reports empty when nothing has been saved", () => {
    expect(loadConfig()).toEqual({ kind: "empty" });
  });

  it("round-trips a full project through save/load", () => {
    const project = edited();
    saveConfig(project);
    expect(loadConfig()).toEqual({ kind: "ok", project });
  });

  it("overwrites the previous save", () => {
    saveConfig(createDefaultProject("first"));
    const project = edited();
    saveConfig(project);
    expect(loadConfig()).toEqual({ kind: "ok", project });
  });

  it("round-trips an image manifest and a scaled Glyph", () => {
    const base = createDefaultProject();
    const project: Project = {
      ...base,
      style: { ...base.style, contentScale: 0.75 },
      images: [{ id: "img-1.png", fileName: "art.png", type: "image/png" }],
    };
    saveConfig(project);
    expect(loadConfig()).toEqual({ kind: "ok", project });
  });

  it("rejects malformed JSON rather than throwing", () => {
    localStorage.setItem(CONFIG_KEY, "{ not json");
    expect(loadConfig()).toEqual({ kind: "rejected" });
  });

  it("rejects a structurally-invalid payload", () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ nope: true }));
    expect(loadConfig()).toEqual({ kind: "rejected" });
  });

  it("rejects the old versioned envelope", () => {
    // Configs used to be wrapped in `{ version, project }` and migrated forward.
    // Neither exists now (ADR-0010), so a pre-change save is discarded cleanly
    // rather than half-read.
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ version: 5, project: edited() }),
    );
    expect(loadConfig()).toEqual({ kind: "rejected" });
  });

  it("removes the key it rejected, so the caller reports it once", () => {
    localStorage.setItem(CONFIG_KEY, "{ not json");
    loadConfig();
    expect(localStorage.getItem(CONFIG_KEY)).toBeNull();
    expect(loadConfig()).toEqual({ kind: "empty" });
  });
});

describe("ProjectStore — config validation", () => {
  // A structurally-current config, spread over to make one field wrong.
  function config(over: Record<string, unknown> = {}): string {
    return JSON.stringify({ ...createDefaultProject(), ...over });
  }

  it("accepts the default project", () => {
    expect(parseConfig(config())).not.toBeNull();
  });

  /** A current config whose Project-tier Background is replaced wholesale. */
  function withBackground(background: unknown): string {
    const base = createDefaultProject();
    return JSON.stringify({ ...base, style: { ...base.style, background } });
  }

  it('rejects a config still spelling "none" as a shape', () => {
    // "none" is a Background *source*, not a fourth shape (ADR-0009). Two fields
    // would otherwise disagree about what the tile is.
    expect(
      parseConfig(
        withBackground({
          shape: "none",
          fill: "#111111",
          cornerRadius: 0,
          border: { width: 0, color: "#000000" },
          source: { kind: "shape" },
        }),
      ),
    ).toBeNull();
  });

  it("rejects a config whose Background source is malformed", () => {
    expect(
      parseConfig(
        withBackground({
          shape: "circle",
          fill: "#111111",
          cornerRadius: 0,
          border: { width: 0, color: "#000000" },
          source: { kind: "authored" },
        }),
      ),
    ).toBeNull();
  });

  it("rejects a config whose Project tier is not a full style", () => {
    // The Project tier is a *full* GlyphStyle, unlike the sparse Device and Glyph
    // overrides — a partial one would leave the cascade with no base to fall to.
    const base = createDefaultProject();
    expect(
      parseConfig(JSON.stringify({ ...base, style: { textColor: "#ffffff" } })),
    ).toBeNull();
  });

  it("rejects a pre-regroup config with flat style and naming fields", () => {
    // Project regrouped into `style` + `exportSettings` (ADR-0012 §6) with no
    // version ladder, so an older save is discarded and the loss reported —
    // once, rather than migrated forward.
    const { name, font, style, images, devices, exportSettings } =
      createDefaultProject();
    expect(
      parseConfig(
        JSON.stringify({
          name,
          font,
          images,
          devices,
          ...style,
          cellSize: exportSettings.cellSize,
          naming: {
            template: exportSettings.naming.template,
            case: exportSettings.naming.case,
          },
          filenameTemplate: exportSettings.naming.filenameTemplate,
        }),
      ),
    ).toBeNull();
  });

  it("rejects a config whose naming lost its filename template", () => {
    const base = createDefaultProject();
    const { template, case: caseStyle } = base.exportSettings.naming;
    expect(
      parseConfig(
        JSON.stringify({
          ...base,
          exportSettings: {
            ...base.exportSettings,
            naming: { template, case: caseStyle },
          },
        }),
      ),
    ).toBeNull();
  });

  it("rejects a config whose image manifest is malformed", () => {
    expect(parseConfig(config({ images: [{ id: 7 }] }))).toBeNull();
  });

  it("normalizes an empty font family to the bundled default", () => {
    // `family` reaches the canvas unresolved, where "" is an invalid font string
    // that silently draws in the browser default — so it is repaired on read and
    // the next save persists the real name (ADR-0010). Asserted through
    // `loadConfig`, since that is the arm the editor actually takes on mount.
    localStorage.setItem(CONFIG_KEY, config({ font: { family: "" } }));
    const loaded = loadConfig();
    expect(loaded).toMatchObject({
      kind: "ok",
      project: { font: { family: DEFAULT_FONT_FAMILY } },
    });
    localStorage.clear();
  });
});

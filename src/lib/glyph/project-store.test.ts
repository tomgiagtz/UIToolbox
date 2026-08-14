import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, parseConfig, saveConfig } from "@/lib/glyph/project-store";
import {
  DEFAULT_FONT_FAMILY,
  createDefaultProject,
} from "@/lib/glyph/defaults";
import { projectReducer } from "@/lib/glyph/project";
import type { Project } from "@/lib/glyph/types";

const CONFIG_KEY = "uitoolbox.glyph-creator.project";

function edited(): Project {
  // A project that differs from the default across every persisted axis, so a
  // faithful round-trip has to carry each one.
  return [
    {
      type: "add-font",
      font: { family: "UITBFont-restored", fileName: "Restored.ttf" },
    } as const,
    {
      type: "patch-style",
      scope: { tier: "project" },
      patch: {
        foreground: { textColor: "#ff0000", fontFamily: "UITBFont-restored" },
        background: { shape: "circle" },
      },
    } as const,
    { type: "set-cell-size", size: 256 } as const,
    { type: "toggle-device", catalogId: "xbox" } as const,
    { type: "add-custom-input", deviceIndex: 0, label: "F5" } as const,
    { type: "set-naming-template", template: "btn_{input}" } as const,
    { type: "set-naming-case", case: "kebab" } as const,
    { type: "set-filename-template", template: "atlas_{device}" } as const,
  ].reduce<Project>(projectReducer, createDefaultProject());
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
    saveConfig(createDefaultProject());
    const project = edited();
    saveConfig(project);
    expect(loadConfig()).toEqual({ kind: "ok", project });
  });

  it("round-trips an image manifest and a transformed Glyph", () => {
    const base = createDefaultProject();
    const project: Project = {
      ...base,
      style: {
        ...base.style,
        foreground: {
          ...base.style.foreground,
          transform: { rotation: 90, scale: { x: -1, y: 0.75 } },
        },
      },
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
  // A structurally-current config, spread over to make one field wrong. A nested
  // block is replaced wholesale, so `style` and `exportSettings` have their own
  // spread helpers below rather than every case restating the nesting.
  function config(over: Record<string, unknown> = {}): string {
    return JSON.stringify({ ...createDefaultProject(), ...over });
  }

  /** The default Project tier with some of its fields swapped. */
  function style(over: Record<string, unknown>): Record<string, unknown> {
    return { ...createDefaultProject().style, ...over };
  }

  /** The default Project tier's foreground, to spread when swapping one field. */
  const FOREGROUND = createDefaultProject().style.foreground;

  /** The default export settings with `naming` replaced wholesale. */
  function settings(naming: Record<string, unknown>): Record<string, unknown> {
    return { ...createDefaultProject().exportSettings, naming };
  }

  it("accepts the default project", () => {
    expect(parseConfig(config())).not.toBeNull();
  });

  it('rejects a config still spelling "none" as a shape', () => {
    // "none" is a Background *source*, not a fourth shape (ADR-0009). Two fields
    // would otherwise disagree about what the tile is.
    expect(
      parseConfig(
        config({
          style: style({
            background: {
              shape: "none",
              fill: "#111111",
              cornerRadius: 0,
              border: { width: 0, color: "#000000" },
              source: { kind: "shape" },
            },
          }),
        }),
      ),
    ).toBeNull();
  });

  it("rejects a config whose Background source is malformed", () => {
    expect(
      parseConfig(
        config({
          style: style({
            background: {
              shape: "circle",
              fill: "#111111",
              cornerRadius: 0,
              border: { width: 0, color: "#000000" },
              source: { kind: "authored" },
            },
          }),
        }),
      ),
    ).toBeNull();
  });

  it("rejects a config whose Project tier is not a full style", () => {
    // The Project tier is a *full* GlyphStyle, unlike the sparse Device and Glyph
    // overrides — a partial one would leave the cascade with no base to fall to.
    expect(parseConfig(config({ style: { textColor: "#ffffff" } }))).toBeNull();
  });

  it("rejects a pre-regroup config with flat style and naming fields", () => {
    // Project regrouped into `style` + `exportSettings` (ADR-0012 §6) with no
    // version ladder, so an older save is discarded and the loss reported —
    // once, rather than migrated forward. Built by hand rather than via
    // `config`, which would leave the new blocks in place and so pass.
    const {
      name,
      style: base,
      fonts,
      images,
      devices,
      exportSettings,
    } = createDefaultProject();
    expect(
      parseConfig(
        JSON.stringify({
          name,
          fonts,
          images,
          devices,
          ...base,
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
    const { template, case: caseStyle } =
      createDefaultProject().exportSettings.naming;
    expect(
      parseConfig(
        config({ exportSettings: settings({ template, case: caseStyle }) }),
      ),
    ).toBeNull();
  });

  it("rejects a config whose image manifest is malformed", () => {
    expect(parseConfig(config({ images: [{ id: 7 }] }))).toBeNull();
  });

  it("rejects a config whose font manifest is malformed", () => {
    expect(parseConfig(config({ fonts: [{ family: 7 }] }))).toBeNull();
  });

  it("rejects a config from before the font joined the cascade", () => {
    // The old shape carried `font: { family }` beside `style`, and a foreground
    // with no `fontFamily`. ADR-0012's Migration section asks each shape change
    // to keep a test that the previous shape is refused, not half-read.
    const { fonts, style: base, ...rest } = createDefaultProject();
    void fonts;
    const { fontFamily, fontWeight, ...foreground } = base.foreground;
    void fontFamily;
    void fontWeight;
    expect(
      parseConfig(
        JSON.stringify({
          ...rest,
          font: { family: "Inter" },
          style: { ...base, foreground },
        }),
      ),
    ).toBeNull();
  });

  describe("repairs an unusable font family (ADR-0012 §6)", () => {
    /** A config whose Project tier names `family`. */
    function namingFamily(family: string): string {
      return config({
        style: style({ foreground: { ...FOREGROUND, fontFamily: family } }),
      });
    }

    it("rewrites an empty family at the Project tier", () => {
      // The family reaches the canvas unresolved, where "" is an invalid font
      // string that silently draws in the browser default — so it is repaired on
      // read and the next save persists it (ADR-0010). Asserted through
      // `loadConfig`, the arm the editor actually takes on mount.
      localStorage.setItem(CONFIG_KEY, namingFamily(""));
      expect(loadConfig()).toMatchObject({
        kind: "ok",
        project: { style: { foreground: { fontFamily: DEFAULT_FONT_FAMILY } } },
      });
      localStorage.clear();
    });

    it("rewrites a family in neither the bundled set nor the manifest", () => {
      // Hand-edited, or trimmed by an older build: there is no asset to offer
      // back, so the Project tier takes the default rather than drawing wrong.
      const parsed = parseConfig(namingFamily("Wingdings"));
      expect(parsed!.style.foreground.fontFamily).toBe(DEFAULT_FONT_FAMILY);
    });

    it("keeps a family the manifest carries", () => {
      const parsed = parseConfig(
        config({
          fonts: [{ family: "UITBFont-1-abc", fileName: "Comic.ttf" }],
          style: style({
            foreground: { ...FOREGROUND, fontFamily: "UITBFont-1-abc" },
          }),
        }),
      );
      expect(parsed!.style.foreground.fontFamily).toBe("UITBFont-1-abc");
    });

    it("keeps a bundled family other than the default", () => {
      const parsed = parseConfig(namingFamily("Titan One"));
      expect(parsed!.style.foreground.fontFamily).toBe("Titan One");
    });

    it("deletes an unknown family from a Device override, so it falls up", () => {
      // A sparse tier has somewhere to fall to, unlike the Project base — so the
      // repair is a deletion, and the Device goes back to inheriting.
      const project = createDefaultProject();
      const parsed = parseConfig(
        config({
          devices: [
            {
              ...project.devices[0],
              style: {
                foreground: { fontFamily: "Wingdings", textColor: "#f00" },
              },
            },
          ],
        }),
      );
      expect(parsed!.devices[0].style).toEqual({
        foreground: { textColor: "#f00" },
      });
    });

    it("deletes an unknown family from a Glyph override too", () => {
      const project = createDefaultProject();
      const parsed = parseConfig(
        config({
          devices: [
            {
              ...project.devices[0],
              glyphStyles: {
                "key-a": { foreground: { fontFamily: "Wingdings" } },
              },
            },
          ],
        }),
      );
      expect(parsed!.devices[0].glyphStyles).toEqual({ "key-a": {} });
    });
  });
});

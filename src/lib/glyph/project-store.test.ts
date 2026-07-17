import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, saveConfig } from "@/lib/glyph/project-store";
import { createDefaultProject } from "@/lib/glyph/presets";
import { projectReducer } from "@/lib/glyph/project";
import type { Project } from "@/lib/glyph/types";

function edited(): Project {
  // A project that differs from the default across every persisted axis, so a
  // faithful round-trip has to carry each one.
  return [
    { type: "set-font", family: "UITBFont-restored" } as const,
    { type: "set-text-color", color: "#ff0000" } as const,
    { type: "set-cell-size", size: 256 } as const,
    { type: "set-bg-shape", shape: "circle" } as const,
    { type: "toggle-device", presetId: "xbox" } as const,
    { type: "add-input", deviceIndex: 0, label: "F5" } as const,
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

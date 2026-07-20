// @vitest-environment node
//
// project-file.ts touches only Blob/File/fflate, no DOM. jsdom's Blob omits
// arrayBuffer(); Node's (like every real browser) implements it, so we exercise
// the round-trip under the Node environment.
import { describe, expect, it } from "vitest";
import {
  exportProjectFile,
  importProjectFile,
  safeBaseName,
} from "@/lib/glyph/project-file";
import { createDefaultProject } from "@/lib/glyph/presets";
import { projectReducer } from "@/lib/glyph/project";
import type { PersistedFont } from "@/lib/glyph/project-store";
import type { Project } from "@/lib/glyph/types";

function edited(): Project {
  return [
    { type: "set-name", name: "My Cool Glyphs" } as const,
    { type: "set-font", family: "UITBFont-abc" } as const,
    { type: "set-text-color", color: "#ff0000" } as const,
    { type: "set-bg-shape", shape: "circle" } as const,
    { type: "toggle-device", presetId: "xbox" } as const,
  ].reduce(projectReducer, createDefaultProject(""));
}

/** Wrap an ExportArtifact's blob back into a File, as an upload would arrive. */
function asFile(blob: Blob, name: string): File {
  return new File([blob], name);
}

describe("project-file — config-only (JSON)", () => {
  it("round-trips a project through export/import with no font", async () => {
    const project = edited();
    const artifact = await exportProjectFile(project, null);
    expect(artifact.filename).toBe("My-Cool-Glyphs.json");

    const imported = await importProjectFile(
      asFile(artifact.blob, artifact.filename),
    );
    expect(imported).not.toBeNull();
    expect(imported!.project).toEqual(project);
    expect(imported!.font).toBeNull();
  });

  it("returns null for a file that isn't a valid project", async () => {
    const junk = asFile(new Blob(["not a project"]), "whatever.json");
    expect(await importProjectFile(junk)).toBeNull();
  });
});

describe("project-file — with font (ZIP)", () => {
  it("round-trips config + font, preserving the font bytes and name", async () => {
    const project = edited();
    const fontBytes = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0xde, 0xad]);
    const font: PersistedFont = {
      family: project.font.family,
      fileName: "Heros.ttf",
      blob: new Blob([fontBytes]),
    };

    const artifact = await exportProjectFile(project, font);
    expect(artifact.filename).toBe("My-Cool-Glyphs.zip");

    const imported = await importProjectFile(
      asFile(artifact.blob, artifact.filename),
    );
    expect(imported).not.toBeNull();
    expect(imported!.project).toEqual(project);
    expect(imported!.font?.fileName).toBe("Heros.ttf");
    // Font family round-trips so the restored FontFace registers under the same
    // name the config references.
    expect(imported!.font?.family).toBe(project.font.family);

    const roundTripped = new Uint8Array(
      await imported!.font!.blob.arrayBuffer(),
    );
    expect(Array.from(roundTripped)).toEqual(Array.from(fontBytes));
  });
});

describe("safeBaseName", () => {
  it("keeps safe names and slugs unsafe characters", () => {
    expect(safeBaseName("my-glyphs")).toBe("my-glyphs");
    expect(safeBaseName("  Xbox / PS5 pack!  ")).toBe("Xbox-PS5-pack");
  });

  it("falls back to the default when nothing usable remains", () => {
    expect(safeBaseName("   ")).toBe("my-glyphs");
    expect(safeBaseName("///")).toBe("my-glyphs");
  });
});

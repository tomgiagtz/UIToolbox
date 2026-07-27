// @vitest-environment node
//
// project-file.ts touches only Blob/File/fflate, no DOM. jsdom's Blob omits
// arrayBuffer(); Node's (like every real browser) implements it, so we exercise
// the round-trip under the Node environment.
import { describe, expect, it } from "vitest";
import { exportProjectFile, importProjectFile } from "@/lib/glyph/project-file";
import { createDefaultProject } from "@/lib/glyph/presets";
import { projectReducer } from "@/lib/glyph/project";
import type { PersistedFont, PersistedImage } from "@/lib/glyph/project-store";
import type { Project } from "@/lib/glyph/types";

function edited(): Project {
  return [
    { type: "set-name", name: "My Cool Glyphs" } as const,
    { type: "set-font", family: "UITBFont-abc" } as const,
    {
      type: "patch-style",
      scope: { tier: "project" },
      patch: { textColor: "#ff0000", background: { shape: "circle" } },
    } as const,
    { type: "toggle-device", catalogId: "xbox" } as const,
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

describe("project-file — custom images (ZIP, issue #20)", () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]);

  function withImage(): { project: Project; image: PersistedImage } {
    const image: PersistedImage = {
      id: "img-1.png",
      fileName: "arrow.png",
      type: "image/png",
      blob: new Blob([bytes]),
    };
    const project: Project = {
      ...edited(),
      images: [{ id: image.id, fileName: image.fileName, type: image.type }],
    };
    return { project, image };
  }

  it("bundles images even when there's no font to bundle", async () => {
    const { project, image } = withImage();
    const artifact = await exportProjectFile(project, null, [image]);
    // Bytes can't ride in the config JSON, so any image forces the ZIP format.
    expect(artifact.filename).toBe("My-Cool-Glyphs.zip");

    const imported = await importProjectFile(
      asFile(artifact.blob, artifact.filename),
    );
    expect(imported!.project).toEqual(project);
    expect(imported!.font).toBeNull();
    expect(imported!.images.map((i) => i.id)).toEqual(["img-1.png"]);
    expect(imported!.images[0].fileName).toBe("arrow.png");
    expect(imported!.images[0].type).toBe("image/png");
    expect(
      Array.from(new Uint8Array(await imported!.images[0].blob.arrayBuffer())),
    ).toEqual(Array.from(bytes));
  });

  it("bundles images alongside the font", async () => {
    const { project, image } = withImage();
    const font: PersistedFont = {
      family: project.font.family,
      fileName: "Heros.ttf",
      blob: new Blob([new Uint8Array([0x00, 0x01])]),
    };

    const imported = await importProjectFile(
      asFile(
        (await exportProjectFile(project, font, [image])).blob,
        "project.zip",
      ),
    );
    // The font is found by elimination, so an images/ entry must not be mistaken
    // for it (and vice versa).
    expect(imported!.font?.fileName).toBe("Heros.ttf");
    expect(imported!.images.map((i) => i.id)).toEqual(["img-1.png"]);
  });

  it("loads a font-only ZIP saved before images existed", async () => {
    const project = edited();
    const font: PersistedFont = {
      family: project.font.family,
      fileName: "Heros.ttf",
      blob: new Blob([new Uint8Array([0x00, 0x01])]),
    };
    const artifact = await exportProjectFile(project, font);

    const imported = await importProjectFile(asFile(artifact.blob, "old.zip"));
    expect(imported!.font?.fileName).toBe("Heros.ttf");
    expect(imported!.images).toEqual([]);
  });
});

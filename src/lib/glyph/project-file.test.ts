// @vitest-environment node
//
// project-file.ts touches only Blob/File/fflate, no DOM. jsdom's Blob omits
// arrayBuffer(); Node's (like every real browser) implements it, so we exercise
// the round-trip under the Node environment.
import { describe, expect, it } from "vitest";
import { unzipSync, zipSync } from "fflate";
import { DEVICE_CATALOGS } from "@/lib/glyph/catalog";
import { exportProjectFile, importProjectFile } from "@/lib/glyph/project-file";
import { DEFAULT_FONT_FAMILY, createDefaultProject } from "@/lib/glyph/presets";
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
    // Not `createDefaultProject("")`: an empty family is repaired on read now
    // (ADR-0010), so it would not survive a round-trip unchanged.
  ].reduce(projectReducer, createDefaultProject());
}

/** A Catalog id the Keyboard Preset leaves disabled, and one it enables. */
function keyboardIds(): { offPreset: string; onPreset: string } {
  const keyboard = DEVICE_CATALOGS.find((c) => c.id === "keyboard")!;
  const offPreset = keyboard.inputs.find(
    (input) => !keyboard.preset.includes(input.id),
  )!.id;
  return { offPreset, onPreset: keyboard.preset[0] };
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

  it("rejects a file saved in the old versioned envelope", async () => {
    // Project files used to be `{ version, project }` and were migrated forward.
    // Neither exists now (ADR-0010), so a pre-change file is refused outright —
    // and the caller reports it, rather than half-reading it.
    const stale = asFile(
      new Blob([JSON.stringify({ version: 5, project: edited() })]),
      "old-project.json",
    );
    expect(await importProjectFile(stale)).toBeNull();
  });

  it("normalizes an empty font family on the import path too", async () => {
    // The repair lives in `parseConfig`, which both entry points share — so a
    // file carrying a pre-#13 empty family lands in Inter, not the browser
    // default (ADR-0010).
    const imported = await importProjectFile(
      asFile(
        new Blob([JSON.stringify({ ...edited(), font: { family: "" } })]),
        "pre-inter.json",
      ),
    );
    expect(imported!.project.font.family).toBe(DEFAULT_FONT_FAMILY);
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

  it("loads a ZIP whose image bytes are missing, keeping the manifest", async () => {
    // A ZIP can arrive without the bytes it describes — hand-assembled, or
    // stripped in transit. The config still loads; the Glyph then degrades to its
    // Symbol or label at draw time rather than the whole file failing (ADR-0004).
    const { project, image } = withImage();
    const full = unzipSync(
      new Uint8Array(
        await (
          await exportProjectFile(project, null, [image])
        ).blob.arrayBuffer(),
      ),
    );
    const stripped = zipSync({ "config.json": full["config.json"] });

    const imported = await importProjectFile(
      asFile(new Blob([stripped.slice()]), "no-bytes.zip"),
    );
    expect(imported).not.toBeNull();
    // The manifest is config, so it survives; only the bytes are gone.
    expect(imported!.project.images).toEqual(project.images);
    expect(imported!.images).toEqual([]);
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

describe("project-file — the whole configured project (issue #23)", () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]);
  const image: PersistedImage = {
    id: "img-1.png",
    fileName: "paddle.png",
    type: "image/png",
    blob: new Blob([bytes]),
  };

  /**
   * A project touched on every axis a save has to carry: the enabled selection,
   * a custom Input, overrides at the Device and Glyph tiers, and a Glyph drawing
   * a custom image. Built through the reducer so the fixture can't drift from the
   * shapes the editor actually produces.
   */
  function configured(): Project {
    const { offPreset, onPreset } = keyboardIds();
    const base = [
      { type: "toggle-input", deviceIndex: 0, inputId: offPreset } as const,
      { type: "toggle-input", deviceIndex: 0, inputId: onPreset } as const,
      { type: "add-custom-input", deviceIndex: 0, label: "Grave" } as const,
      {
        type: "patch-style",
        scope: { tier: "device", deviceIndex: 0 },
        patch: { background: { fill: "#123456" } },
      } as const,
      {
        type: "patch-style",
        scope: { tier: "glyph", deviceIndex: 0, glyphId: offPreset },
        patch: { textColor: "#00ff00", contentScale: 1.5 },
      } as const,
      {
        type: "patch-style",
        scope: { tier: "glyph", deviceIndex: 0, glyphId: onPreset },
        patch: { renderSource: { kind: "image", imageId: image.id } },
      } as const,
    ].reduce(projectReducer, edited());
    // The manifest entry the Render Source above points at.
    return {
      ...base,
      images: [{ id: image.id, fileName: image.fileName, type: image.type }],
    };
  }

  it("round-trips selection, custom Inputs, overrides, Render Source and bytes", async () => {
    const project = configured();
    const keyboard = project.devices[0];
    const { offPreset, onPreset } = keyboardIds();
    // Guard the fixture: an assertion below is only meaningful if the reducer
    // actually moved these.
    expect(keyboard.enabled).toContain(offPreset);
    expect(keyboard.enabled).not.toContain(onPreset);
    expect(keyboard.custom.map((c) => c.label)).toEqual(["Grave"]);

    const artifact = await exportProjectFile(project, null, [image]);
    const imported = await importProjectFile(
      asFile(artifact.blob, artifact.filename),
    );

    // The config is a bare Project, so one deep equality covers every axis —
    // selection, custom Inputs, both override tiers, and the Render Source.
    expect(imported!.project).toEqual(project);
    expect(
      Array.from(new Uint8Array(await imported!.images[0].blob.arrayBuffer())),
    ).toEqual(Array.from(bytes));
  });
});

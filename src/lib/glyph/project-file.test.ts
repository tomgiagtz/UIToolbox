// @vitest-environment node
//
// project-file.ts touches only Blob/File/fflate, no DOM. jsdom's Blob omits
// arrayBuffer(); Node's (like every real browser) implements it, so we exercise
// the round-trip under the Node environment.
import { describe, expect, it } from "vitest";
import { unzipSync, zipSync } from "fflate";
import { DEVICE_CATALOGS } from "@/lib/glyph/catalog";
import {
  exportProjectFile,
  importProjectFile,
  withAvailableImages,
} from "@/lib/glyph/project-file";
import {
  DEFAULT_FONT_FAMILY,
  createDefaultProject,
} from "@/lib/glyph/defaults";
import { projectReducer } from "@/lib/glyph/project";
import type { PersistedFont, PersistedImage } from "@/lib/glyph/project-store";
import type { Project } from "@/lib/glyph/types";

function edited(): Project {
  return [
    { type: "set-name", name: "My Cool Glyphs" } as const,
    {
      type: "patch-style",
      scope: { tier: "project" },
      patch: {
        foreground: { textColor: "#ff0000" },
        background: { shape: "circle" },
      },
    } as const,
    { type: "toggle-device", catalogId: "xbox" } as const,
  ].reduce<Project>(projectReducer, createDefaultProject());
}

/** A Catalog id the Keyboard's Default Selection leaves disabled, and one it enables. */
function keyboardSelectionEdges(): {
  disabledByDefault: string;
  enabledByDefault: string;
} {
  const keyboard = DEVICE_CATALOGS.find((c) => c.id === "keyboard")!;
  const disabledByDefault = keyboard.inputs.find(
    (input) => !keyboard.defaultEnabled.includes(input.id),
  )!.id;
  return { disabledByDefault, enabledByDefault: keyboard.defaultEnabled[0] };
}

/** Wrap an ExportArtifact's blob back into a File, as an upload would arrive. */
function asFile(blob: Blob, name: string): File {
  return new File([blob], name);
}

describe("project-file — config-only (JSON)", () => {
  it("round-trips a project through export/import with no font", async () => {
    const project = edited();
    const artifact = await exportProjectFile(project);
    expect(artifact.filename).toBe("My-Cool-Glyphs.json");

    const imported = await importProjectFile(
      asFile(artifact.blob, artifact.filename),
    );
    expect(imported).not.toBeNull();
    expect(imported!.project).toEqual(project);
    expect(imported!.fonts).toEqual([]);
  });

  it("saves as plain JSON when every family is a bundled one", async () => {
    // A project styled entirely in shipped families carries no bytes worth
    // zipping — the tool on the other end already has them.
    const project = edited();
    expect(project.fonts).toEqual([]);
    expect((await exportProjectFile(project, [], [])).filename).toBe(
      "My-Cool-Glyphs.json",
    );
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

  it("normalizes an unusable font family on the import path too", async () => {
    // The repair lives in `parseConfig`, which both entry points share — so a
    // file naming a family nothing can draw lands in the bundled default rather
    // than in whatever the browser picks (ADR-0010).
    const base = edited();
    const imported = await importProjectFile(
      asFile(
        new Blob([
          JSON.stringify({
            ...base,
            style: {
              ...base.style,
              foreground: { ...base.style.foreground, fontFamily: "" },
            },
          }),
        ]),
        "no-family.json",
      ),
    );
    expect(imported!.project.style.foreground.fontFamily).toBe(
      DEFAULT_FONT_FAMILY,
    );
  });

  it("rejects a config from before the font joined the cascade", async () => {
    // The old shape carried `font: { family }` beside `style` and no `fonts`.
    // ADR-0012's Migration section asks each shape change to keep a test that
    // the previous shape is refused rather than half-read.
    const { fonts, ...rest } = edited();
    void fonts;
    const stale = { ...rest, font: { family: "Inter" } };
    expect(
      await importProjectFile(
        asFile(new Blob([JSON.stringify(stale)]), "old-shape.json"),
      ),
    ).toBeNull();
  });
});

describe("project-file — uploaded fonts (ZIP, ADR-0012 §7)", () => {
  const bytes = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0xde, 0xad]);

  /** A project whose Project tier draws in one uploaded family. */
  function withFont(): { project: Project; font: PersistedFont } {
    const font: PersistedFont = {
      family: "UITBFont-1-abc",
      fileName: "Heros.ttf",
      blob: new Blob([bytes]),
    };
    const base = edited();
    const project: Project = {
      ...base,
      fonts: [{ family: font.family, fileName: font.fileName }],
      style: {
        ...base.style,
        foreground: { ...base.style.foreground, fontFamily: font.family },
      },
    };
    return { project, font };
  }

  it("round-trips config + font under fonts/, preserving bytes and name", async () => {
    const { project, font } = withFont();
    const artifact = await exportProjectFile(project, [font]);
    expect(artifact.filename).toBe("My-Cool-Glyphs.zip");

    const entries = unzipSync(
      new Uint8Array(await artifact.blob.arrayBuffer()),
    );
    expect(Object.keys(entries).sort()).toEqual([
      "config.json",
      "fonts/Heros.ttf",
    ]);

    const imported = await importProjectFile(
      asFile(artifact.blob, artifact.filename),
    );
    expect(imported!.project).toEqual(project);
    expect(imported!.fonts.map((f) => f.fileName)).toEqual(["Heros.ttf"]);
    // The family round-trips so the restored FontFace registers under the same
    // name every tier of the config references.
    expect(imported!.fonts[0].family).toBe(font.family);
    expect(
      Array.from(new Uint8Array(await imported!.fonts[0].blob.arrayBuffer())),
    ).toEqual(Array.from(bytes));
  });

  it("carries two fonts, keyed by their manifest file names", async () => {
    // The heuristic this replaced picked "whatever entry is left over", which
    // could never have told these two apart.
    const { project, font } = withFont();
    const second: PersistedFont = {
      family: "UITBFont-2-def",
      fileName: "Heros-2.ttf",
      blob: new Blob([new Uint8Array([0x99])]),
    };
    const twoFonts: Project = {
      ...project,
      fonts: [
        ...project.fonts,
        { family: second.family, fileName: second.fileName },
      ],
    };

    const imported = await importProjectFile(
      asFile(
        (await exportProjectFile(twoFonts, [font, second])).blob,
        "project.zip",
      ),
    );
    expect(imported!.fonts.map((f) => [f.family, f.fileName])).toEqual([
      [font.family, "Heros.ttf"],
      [second.family, "Heros-2.ttf"],
    ]);
    expect(
      Array.from(new Uint8Array(await imported!.fonts[1].blob.arrayBuffer())),
    ).toEqual([0x99]);
  });

  it("loads a ZIP whose font bytes are missing, keeping the manifest", async () => {
    // Same posture as a missing image: the config still loads, and the family
    // is repaired to a drawable one on read rather than the file failing.
    const { project, font } = withFont();
    const full = unzipSync(
      new Uint8Array(
        await (await exportProjectFile(project, [font])).blob.arrayBuffer(),
      ),
    );
    const stripped = zipSync({ "config.json": full["config.json"] });

    const imported = await importProjectFile(
      asFile(new Blob([stripped.slice()]), "no-bytes.zip"),
    );
    expect(imported).not.toBeNull();
    expect(imported!.fonts).toEqual([]);
    // The manifest is config, so it survives — the bytes are what is gone.
    expect(imported!.project.fonts).toEqual(project.fonts);
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
    const artifact = await exportProjectFile(project, [], [image]);
    // Bytes can't ride in the config JSON, so any image forces the ZIP format.
    expect(artifact.filename).toBe("My-Cool-Glyphs.zip");

    const imported = await importProjectFile(
      asFile(artifact.blob, artifact.filename),
    );
    expect(imported!.project).toEqual(project);
    expect(imported!.fonts).toEqual([]);
    expect(imported!.images.map((i) => i.id)).toEqual(["img-1.png"]);
    expect(imported!.images[0].fileName).toBe("arrow.png");
    expect(imported!.images[0].type).toBe("image/png");
    expect(
      Array.from(new Uint8Array(await imported!.images[0].blob.arrayBuffer())),
    ).toEqual(Array.from(bytes));
  });

  it("bundles images alongside fonts, each under its own folder", async () => {
    const { project, image } = withImage();
    const font: PersistedFont = {
      family: "UITBFont-1-abc",
      fileName: "Heros.ttf",
      blob: new Blob([new Uint8Array([0x00, 0x01])]),
    };
    const withBoth: Project = {
      ...project,
      fonts: [{ family: font.family, fileName: font.fileName }],
    };

    const artifact = await exportProjectFile(withBoth, [font], [image]);
    expect(
      Object.keys(unzipSync(new Uint8Array(await artifact.blob.arrayBuffer()))),
    ).toEqual(["config.json", "fonts/Heros.ttf", "images/img-1.png"]);

    const imported = await importProjectFile(asFile(artifact.blob, "p.zip"));
    expect(imported!.fonts.map((f) => f.fileName)).toEqual(["Heros.ttf"]);
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
          await exportProjectFile(project, [], [image])
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
});

describe("project-file — narrowing a loaded manifest to the bytes that came", () => {
  const image: PersistedImage = {
    id: "img-1.png",
    fileName: "arrow.png",
    type: "image/png",
    blob: new Blob([new Uint8Array([0x89, 0x50])]),
  };
  const manifest = { id: image.id, fileName: image.fileName, type: image.type };

  it("drops manifest entries whose bytes never arrived", () => {
    // The e2e case: a config shared without its assets. Left in the manifest, the
    // entry claims an asset the editor can't draw, and the Glyph pointing at it
    // renders its label instead of falling back to its Symbol.
    const project: Project = { ...edited(), images: [manifest] };
    expect(withAvailableImages(project, []).images).toEqual([]);
  });

  it("keeps the entries whose bytes did arrive", () => {
    const project: Project = { ...edited(), images: [manifest] };
    expect(withAvailableImages(project, [image]).images).toEqual([manifest]);
  });

  it("narrows a partial restore to just the assets present", () => {
    const other = { id: "img-2.png", fileName: "b.png", type: "image/png" };
    const project: Project = { ...edited(), images: [manifest, other] };
    expect(withAvailableImages(project, [image]).images).toEqual([manifest]);
  });

  it("leaves the rest of the project alone", () => {
    const project: Project = { ...edited(), images: [manifest] };
    const narrowed = withAvailableImages(project, []);
    expect({ ...narrowed, images: [] }).toEqual({ ...project, images: [] });
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
    const { disabledByDefault, enabledByDefault } = keyboardSelectionEdges();
    const base = [
      {
        type: "toggle-input",
        deviceIndex: 0,
        inputId: disabledByDefault,
      } as const,
      {
        type: "toggle-input",
        deviceIndex: 0,
        inputId: enabledByDefault,
      } as const,
      { type: "add-custom-input", deviceIndex: 0, label: "Grave" } as const,
      {
        type: "patch-style",
        scope: { tier: "device", deviceIndex: 0 },
        patch: { background: { fill: "#123456" } },
      } as const,
      {
        type: "patch-style",
        scope: { tier: "glyph", deviceIndex: 0, glyphId: disabledByDefault },
        patch: {
          textColor: "#00ff00",
          content: { transform: { rotation: 90, scale: { x: -1 } } },
        },
      } as const,
      {
        type: "patch-style",
        scope: { tier: "glyph", deviceIndex: 0, glyphId: enabledByDefault },
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
    const { disabledByDefault, enabledByDefault } = keyboardSelectionEdges();
    // Guard the fixture: an assertion below is only meaningful if the reducer
    // actually moved these.
    expect(keyboard.enabled).toContain(disabledByDefault);
    expect(keyboard.enabled).not.toContain(enabledByDefault);
    expect(keyboard.custom.map((c) => c.label)).toEqual(["Grave"]);

    const artifact = await exportProjectFile(project, [], [image]);
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

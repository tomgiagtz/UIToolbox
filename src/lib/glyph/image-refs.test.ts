import { describe, expect, it } from "vitest";
import { createDefaultProject } from "@/lib/glyph/defaults";
import { imageReferences, unusedImages } from "@/lib/glyph/image-refs";
import { projectReducer, type ProjectAction } from "@/lib/glyph/project";
import type { Project } from "@/lib/glyph/types";

/** A project carrying two uploads and a second Device to spread them over. */
function base(): Project {
  return run(
    createDefaultProject(),
    {
      type: "add-image",
      image: { id: "a.png", fileName: "a.png", type: "image/png" },
    },
    {
      type: "add-image",
      image: { id: "b.png", fileName: "b.png", type: "image/png" },
    },
    { type: "toggle-device", catalogId: "xbox" },
  );
}

function run(project: Project, ...actions: ProjectAction[]): Project {
  return actions.reduce(projectReducer, project);
}

/** Every scope naming `id`, flattened to a comparable shape. */
function scopesFor(project: Project, id: string) {
  return (imageReferences(project).get(id) ?? []).map((ref) => ({
    tier: ref.scope.tier,
    field: ref.field,
  }));
}

describe("imageReferences — every site an image id can be named (#62)", () => {
  it("finds a Background source on the Project base", () => {
    const next = run(base(), {
      type: "patch-style",
      scope: { tier: "project" },
      patch: { background: { source: { kind: "image", imageId: "a.png" } } },
    });

    expect(scopesFor(next, "a.png")).toEqual([
      { tier: "project", field: "backgroundSource" },
    ]);
  });

  it("finds a Background source and a Render Source at the Device tier", () => {
    const next = run(base(), {
      type: "patch-style",
      scope: { tier: "device", deviceIndex: 1 },
      patch: {
        background: { source: { kind: "image", imageId: "a.png" } },
        foreground: { renderSource: { kind: "image", imageId: "b.png" } },
      },
    });

    expect(scopesFor(next, "a.png")).toEqual([
      { tier: "device", field: "backgroundSource" },
    ]);
    expect(scopesFor(next, "b.png")).toEqual([
      { tier: "device", field: "renderSource" },
    ]);
  });

  it("finds both fields at the Glyph tier, and carries the glyph id", () => {
    const next = run(base(), {
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 1, glyphId: "xbox-a" },
      patch: {
        background: { source: { kind: "image", imageId: "a.png" } },
        foreground: { renderSource: { kind: "image", imageId: "a.png" } },
      },
    });

    const refs = imageReferences(next).get("a.png") ?? [];
    expect(refs.map((r) => r.field).sort()).toEqual([
      "backgroundSource",
      "renderSource",
    ]);
    // The scope has to be precise enough to clear the override it found.
    expect(refs[0].scope).toEqual({
      tier: "glyph",
      deviceIndex: 1,
      glyphId: "xbox-a",
    });
  });

  it("collects one image referenced from several scopes at once", () => {
    const next = run(
      base(),
      {
        type: "patch-style",
        scope: { tier: "project" },
        patch: { background: { source: { kind: "image", imageId: "a.png" } } },
      },
      {
        type: "patch-style",
        scope: { tier: "glyph", deviceIndex: 1, glyphId: "xbox-a" },
        patch: {
          foreground: { renderSource: { kind: "image", imageId: "a.png" } },
        },
      },
    );

    expect(scopesFor(next, "a.png")).toHaveLength(2);
  });

  it("ignores sources that name no image", () => {
    // `authored` also carries an id; keying on `kind` rather than on the
    // presence of an id is what keeps a tile's backgroundId out of the walk.
    const next = run(base(), {
      type: "patch-style",
      scope: { tier: "device", deviceIndex: 1 },
      patch: {
        background: { source: { kind: "authored", backgroundId: "bumper" } },
        foreground: { renderSource: { kind: "symbol" } },
      },
    });

    expect(imageReferences(next).size).toBe(0);
  });
});

describe("unusedImages — what a sweep may drop (#62)", () => {
  it("reports every manifest row when nothing references any of them", () => {
    expect(unusedImages(base()).map((i) => i.id)).toEqual(["a.png", "b.png"]);
  });

  it("keeps an image referenced anywhere, at any tier", () => {
    const next = run(base(), {
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 1, glyphId: "xbox-a" },
      patch: {
        foreground: { renderSource: { kind: "image", imageId: "a.png" } },
      },
    });

    expect(unusedImages(next).map((i) => i.id)).toEqual(["b.png"]);
  });

  it("does not invent rows for a reference with no manifest entry", () => {
    // A dangling reference is already harmless — `resolveRenderSource` checks the
    // manifest — so a sweep must report the manifest, not the references.
    const next = run(base(), {
      type: "patch-style",
      scope: { tier: "project" },
      patch: { background: { source: { kind: "image", imageId: "gone.png" } } },
    });

    expect(unusedImages(next).map((i) => i.id)).toEqual(["a.png", "b.png"]);
  });
});

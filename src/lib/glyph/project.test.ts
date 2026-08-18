import { describe, expect, it } from "vitest";
import { projectReducer, type ProjectAction } from "@/lib/glyph/project";
import {
  DEFAULT_FONT_FAMILY,
  createDefaultProject,
} from "@/lib/glyph/defaults";
import type { Project } from "@/lib/glyph/types";

function base(): Project {
  return createDefaultProject();
}

describe("createDefaultProject", () => {
  it("draws in the bundled default family, manifesting nothing", () => {
    // The manifest lists uploads; the default was never one (ADR-0012 §6).
    expect(createDefaultProject().style.foreground.fontFamily).toBe(
      DEFAULT_FONT_FAMILY,
    );
    expect(DEFAULT_FONT_FAMILY).toBe("Inter");
    expect(createDefaultProject().fonts).toEqual([]);
  });
});

function run(project: Project, ...actions: ProjectAction[]): Project {
  return actions.reduce(projectReducer, project);
}

describe("projectReducer — style cascade (#4, #19)", () => {
  const project = { tier: "project" } as const;

  it("folds a Project-tier patch into the full base style", () => {
    const next = run(
      base(),
      {
        type: "patch-style",
        scope: project,
        patch: { foreground: { textColor: "#ff0000" } },
      },
      {
        type: "patch-style",
        scope: project,
        patch: { background: { fill: "#123456" } },
      },
      {
        type: "patch-style",
        scope: project,
        patch: { background: { border: { width: 8 } } },
      },
    );
    expect(next.style.foreground.textColor).toBe("#ff0000");
    expect(next.style.background.fill).toBe("#123456");
    // Border deep-merges: width changes, color survives.
    expect(next.style.background.border).toEqual({
      width: 8,
      color: base().style.background.border.color,
    });
  });

  it("stores a Device-tier edit as a sparse override, leaving Project untouched", () => {
    const next = run(base(), {
      type: "patch-style",
      scope: { tier: "device", deviceIndex: 0 },
      patch: { background: { shape: "circle" } },
    });
    expect(next.devices[0].style).toEqual({ background: { shape: "circle" } });
    expect(next.style.background.shape).toBe(base().style.background.shape);
  });

  it("stores a Glyph-tier edit keyed by glyph id", () => {
    const next = run(base(), {
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "key-w" },
      patch: { foreground: { textColor: "#0f0" } },
    });
    expect(next.devices[0].glyphStyles).toEqual({
      "key-w": { foreground: { textColor: "#0f0" } },
    });
  });

  it("clears one overridden field so it falls back up the cascade", () => {
    const scope = { tier: "device", deviceIndex: 0 } as const;
    const next = run(
      base(),
      {
        type: "patch-style",
        scope,
        patch: { background: { shape: "circle", fill: "#111" } },
      },
      { type: "clear-style", scope, field: "fill" },
    );
    expect(next.devices[0].style).toEqual({ background: { shape: "circle" } });
  });

  it("drops a Glyph override entirely once its last field is cleared", () => {
    const scope = { tier: "glyph", deviceIndex: 0, glyphId: "key-w" } as const;
    const next = run(
      base(),
      {
        type: "patch-style",
        scope,
        patch: { foreground: { textColor: "#0f0" } },
      },
      { type: "clear-style", scope, field: "textColor" },
    );
    expect(next.devices[0].glyphStyles).toEqual({});
  });

  it("sets the cell size (an export setting, never cascaded)", () => {
    const next = run(base(), { type: "set-cell-size", size: 256 });
    expect(next.exportSettings.cellSize).toBe(256);
    // Naming shares the block and must survive a cell-size edit.
    expect(next.exportSettings.naming).toEqual(base().exportSettings.naming);
  });

  it("does not mutate the previous project (immutability)", () => {
    const prev = base();
    const snapshot = JSON.parse(JSON.stringify(prev));
    projectReducer(prev, {
      type: "patch-style",
      scope: { tier: "device", deviceIndex: 0 },
      patch: { background: { fill: "#000000" } },
    });
    expect(prev).toEqual(snapshot);
  });
});

describe("projectReducer — devices (#5)", () => {
  it("adds a Device built from a Catalog's Default Selection", () => {
    const next = run(base(), { type: "toggle-device", catalogId: "xbox" });
    expect(next.devices.map((d) => d.name)).toEqual(["Keyboard", "Xbox"]);
    expect(next.devices[1].catalogId).toBe("xbox");
    expect(next.devices[1].enabled).toContain("xbox-a");
    expect(next.devices[1].custom).toEqual([]);
  });

  it("keeps Devices in Catalog order regardless of toggle sequence", () => {
    const next = run(
      base(),
      { type: "toggle-device", catalogId: "playstation" },
      { type: "toggle-device", catalogId: "xbox" },
    );
    expect(next.devices.map((d) => d.name)).toEqual([
      "Keyboard",
      "Xbox",
      "PlayStation",
    ]);
  });

  it("removes a Device when toggled off", () => {
    const next = run(
      base(),
      { type: "toggle-device", catalogId: "xbox" },
      { type: "toggle-device", catalogId: "xbox" },
    );
    expect(next.devices.map((d) => d.name)).toEqual(["Keyboard"]);
  });
});

describe("projectReducer — Catalog Inputs & custom Inputs (#15)", () => {
  it("disables an enabled Catalog Input", () => {
    const next = run(base(), {
      type: "toggle-input",
      deviceIndex: 0,
      inputId: "key-w",
    });
    expect(next.devices[0].enabled).not.toContain("key-w");
  });

  it("re-enables a Catalog Input in Catalog order", () => {
    // key-esc sits before key-w, key-a … in the Catalog, so re-enabling it lands
    // ahead of them rather than at the end.
    const next = run(
      base(),
      { type: "toggle-input", deviceIndex: 0, inputId: "key-esc" },
      { type: "toggle-input", deviceIndex: 0, inputId: "key-esc" },
    );
    const enabled = next.devices[0].enabled;
    expect(enabled).toContain("key-esc");
    expect(enabled.indexOf("key-esc")).toBeLessThan(enabled.indexOf("key-w"));
  });

  it("adds a custom Input with a fresh id", () => {
    const next = run(base(), {
      type: "add-custom-input",
      deviceIndex: 0,
      label: "F5",
    });
    expect(next.devices[0].custom).toEqual([{ id: "custom-1", label: "F5" }]);
  });

  it("gives each custom Input a distinct id", () => {
    const next = run(
      base(),
      { type: "add-custom-input", deviceIndex: 0, label: "F5" },
      { type: "add-custom-input", deviceIndex: 0, label: "F6" },
    );
    expect(next.devices[0].custom.map((c) => c.id)).toEqual([
      "custom-1",
      "custom-2",
    ]);
  });

  it("ignores an empty or whitespace-only custom Input", () => {
    const next = run(
      base(),
      { type: "add-custom-input", deviceIndex: 0, label: "   " },
      { type: "add-custom-input", deviceIndex: 0, label: "" },
    );
    expect(next.devices[0].custom).toEqual([]);
  });

  it("edits a custom Input label in place", () => {
    const next = run(
      base(),
      { type: "add-custom-input", deviceIndex: 0, label: "F5" },
      {
        type: "edit-custom-input",
        deviceIndex: 0,
        id: "custom-1",
        label: "F6",
      },
    );
    expect(next.devices[0].custom).toEqual([{ id: "custom-1", label: "F6" }]);
  });

  it("removes a custom Input by id", () => {
    const next = run(
      base(),
      { type: "add-custom-input", deviceIndex: 0, label: "F5" },
      { type: "remove-custom-input", deviceIndex: 0, id: "custom-1" },
    );
    expect(next.devices[0].custom).toEqual([]);
  });
});

describe("projectReducer — naming (#6)", () => {
  it("sets the Sprite-Name template", () => {
    const next = run(base(), {
      type: "set-naming-template",
      template: "btn_{input}",
    });
    expect(next.exportSettings.naming.template).toBe("btn_{input}");
  });

  it("sets the case style", () => {
    const next = run(base(), { type: "set-naming-case", case: "kebab" });
    expect(next.exportSettings.naming.case).toBe("kebab");
  });

  it("sets the output-filename template", () => {
    const next = run(base(), {
      type: "set-filename-template",
      template: "atlas_{device}",
    });
    expect(next.exportSettings.naming.filenameTemplate).toBe("atlas_{device}");
    // The filename template shares NamingConfig with the Sprite-Name one, which
    // it must not overwrite.
    expect(next.exportSettings.naming.template).toBe(
      base().exportSettings.naming.template,
    );
    // …and the cell size shares the block above it.
    expect(next.exportSettings.cellSize).toBe(base().exportSettings.cellSize);
  });
});

describe("projectReducer — uploaded fonts (#80)", () => {
  const font = { family: "UITBFont-1-abc", fileName: "Comic.ttf" };

  it("appends an upload to the manifest without restyling anything", () => {
    // Adding bytes and choosing to draw in them are two acts: the family is
    // then set through `patch-style`, at whatever scope the user is editing.
    const next = run(base(), { type: "add-font", font });
    expect(next.fonts).toEqual([font]);
    expect(next.style.foreground.fontFamily).toBe(DEFAULT_FONT_FAMILY);
  });

  it("sets the family at a Device tier, leaving the Project tier alone", () => {
    const next = run(
      base(),
      { type: "add-font", font },
      {
        type: "patch-style",
        scope: { tier: "device", deviceIndex: 0 },
        patch: { foreground: { fontFamily: font.family } },
      },
    );
    expect(next.devices[0].style.foreground?.fontFamily).toBe(font.family);
    expect(next.style.foreground.fontFamily).toBe(DEFAULT_FONT_FAMILY);
  });
});

describe("projectReducer — Render Source & custom images (#20)", () => {
  const image = { id: "img-1.png", fileName: "art.png", type: "image/png" };

  it("starts with no images and both layers at identity", () => {
    expect(base().images).toEqual([]);
    const identity = { rotation: 0, scale: { x: 1, y: 1 } };
    expect(base().style.foreground.transform).toEqual(identity);
    expect(base().style.background.transform).toEqual(identity);
  });

  it("adds an uploaded image to the shared manifest", () => {
    const next = run(base(), { type: "add-image", image });
    expect(next.images).toEqual([image]);
  });

  it("stores a Glyph's Render Source as a cascade override", () => {
    const scope = {
      tier: "glyph",
      deviceIndex: 0,
      glyphId: "key-w",
    } as const;
    const next = run(
      base(),
      { type: "add-image", image },
      {
        type: "patch-style",
        scope,
        patch: {
          foreground: { renderSource: { kind: "image", imageId: image.id } },
        },
      },
    );
    expect(next.devices[0].glyphStyles["key-w"]).toEqual({
      foreground: { renderSource: { kind: "image", imageId: image.id } },
    });
  });

  it("clears a Glyph's Render Source so it falls back up the cascade", () => {
    const scope = {
      tier: "glyph",
      deviceIndex: 0,
      glyphId: "key-w",
    } as const;
    const next = run(
      base(),
      {
        type: "patch-style",
        scope,
        patch: { foreground: { renderSource: { kind: "label" } } },
      },
      { type: "clear-style", scope, field: "renderSource" },
    );
    // The whole override collapses, leaving the Glyph with no trace.
    expect(next.devices[0].glyphStyles["key-w"]).toBeUndefined();
  });

  it("folds a Project-tier content transform into the base style", () => {
    const next = run(base(), {
      type: "patch-style",
      scope: { tier: "project" },
      patch: { foreground: { transform: { scale: { x: 0.6, y: 0.6 } } } },
    });
    // The Project tier is a full style, so the patch lands totalled: the axis it
    // named changed and the rotation it didn't is still spelled out.
    expect(next.style.foreground.transform).toEqual({
      rotation: 0,
      scale: { x: 0.6, y: 0.6 },
    });
  });

  it("stores a Device-tier content transform as a sparse override", () => {
    const next = run(base(), {
      type: "patch-style",
      scope: { tier: "device", deviceIndex: 0 },
      patch: { foreground: { transform: { rotation: 90 } } },
    });
    // Sparse at an override tier: the scale it didn't name stays absent, so it
    // keeps falling up rather than pinning identity.
    expect(next.devices[0].style).toEqual({
      foreground: { transform: { rotation: 90 } },
    });
    expect(next.style.foreground.transform.rotation).toBe(0);
  });
});

describe("projectReducer — removing a custom image (ADR-0014, #62)", () => {
  const IMAGE = { id: "a.png", fileName: "a.png", type: "image/png" };
  const OTHER = { id: "b.png", fileName: "b.png", type: "image/png" };

  /** Two uploads and a second Device, so every tier is reachable. */
  function withImages(): Project {
    return run(
      base(),
      { type: "add-image", image: IMAGE },
      { type: "add-image", image: OTHER },
      { type: "toggle-device", catalogId: "xbox" },
    );
  }

  it("drops the manifest row", () => {
    const next = run(withImages(), { type: "remove-image", imageId: "a.png" });
    expect(next.images.map((i) => i.id)).toEqual(["b.png"]);
  });

  it("clears a Render Source override that named it, at the Glyph tier", () => {
    const used = run(withImages(), {
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 1, glyphId: "xbox-a" },
      patch: {
        foreground: { renderSource: { kind: "image", imageId: "a.png" } },
      },
    });

    const next = run(used, { type: "remove-image", imageId: "a.png" });
    // The override held nothing else, so it leaves no trace behind.
    expect(next.devices[1].glyphStyles["xbox-a"]).toBeUndefined();
  });

  it("clears a Background source at the Device tier, keeping its other fields", () => {
    const used = run(withImages(), {
      type: "patch-style",
      scope: { tier: "device", deviceIndex: 1 },
      patch: {
        background: {
          source: { kind: "image", imageId: "a.png" },
          fill: "#123456",
        },
      },
    });

    const next = run(used, { type: "remove-image", imageId: "a.png" });
    expect(next.devices[1].style.background?.source).toBeUndefined();
    expect(next.devices[1].style.background?.fill).toBe("#123456");
  });

  it("writes the default shape over a Project base that used it", () => {
    // The base is a full GlyphStyle, so there is nothing to fall back to and the
    // field cannot be cleared — it takes the default source outright, and the
    // shape, fill and border it already carried are left alone (ADR-0014 §4).
    const used = run(withImages(), {
      type: "patch-style",
      scope: { tier: "project" },
      patch: { background: { source: { kind: "image", imageId: "a.png" } } },
    });

    const next = run(used, { type: "remove-image", imageId: "a.png" });
    expect(next.style.background.source).toEqual({ kind: "shape" });
    expect(next.style.background.fill).toBe(used.style.background.fill);
    expect(next.style.background.cornerRadius).toBe(
      used.style.background.cornerRadius,
    );
  });

  it("clears every tier that named it in one action", () => {
    const used = run(
      withImages(),
      {
        type: "patch-style",
        scope: { tier: "project" },
        patch: { background: { source: { kind: "image", imageId: "a.png" } } },
      },
      {
        type: "patch-style",
        scope: { tier: "device", deviceIndex: 1 },
        patch: {
          foreground: { renderSource: { kind: "image", imageId: "a.png" } },
        },
      },
      {
        type: "patch-style",
        scope: { tier: "glyph", deviceIndex: 1, glyphId: "xbox-b" },
        patch: { background: { source: { kind: "image", imageId: "a.png" } } },
      },
    );

    const next = run(used, { type: "remove-image", imageId: "a.png" });
    expect(next.style.background.source).toEqual({ kind: "shape" });
    expect(next.devices[1].style.foreground?.renderSource).toBeUndefined();
    expect(next.devices[1].glyphStyles["xbox-b"]).toBeUndefined();
  });

  it("leaves references to other images alone", () => {
    const used = run(withImages(), {
      type: "patch-style",
      scope: { tier: "device", deviceIndex: 1 },
      patch: { background: { source: { kind: "image", imageId: "b.png" } } },
    });

    const next = run(used, { type: "remove-image", imageId: "a.png" });
    expect(next.devices[1].style.background?.source).toEqual({
      kind: "image",
      imageId: "b.png",
    });
  });

  it("is a no-op for an id the manifest never carried", () => {
    const project = withImages();
    expect(run(project, { type: "remove-image", imageId: "gone.png" })).toBe(
      project,
    );
  });
});

describe("projectReducer — sweeping unused images (ADR-0014 §5, #62)", () => {
  function withImages(): Project {
    return run(
      base(),
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

  it("drops every row nothing references", () => {
    const next = run(withImages(), { type: "sweep-unused-images" });
    expect(next.images).toEqual([]);
  });

  it("never drops an image referenced anywhere", () => {
    const used = run(withImages(), {
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 1, glyphId: "xbox-a" },
      patch: {
        foreground: { renderSource: { kind: "image", imageId: "a.png" } },
      },
    });

    const next = run(used, { type: "sweep-unused-images" });
    expect(next.images.map((i) => i.id)).toEqual(["a.png"]);
    // Nothing was cleared, because by construction there was nothing to clear.
    expect(
      next.devices[1].glyphStyles["xbox-a"].foreground?.renderSource,
    ).toEqual({ kind: "image", imageId: "a.png" });
  });

  it("is a no-op when every image is in use", () => {
    const used = run(
      withImages(),
      {
        type: "patch-style",
        scope: { tier: "project" },
        patch: { background: { source: { kind: "image", imageId: "a.png" } } },
      },
      {
        type: "patch-style",
        scope: { tier: "device", deviceIndex: 1 },
        patch: {
          foreground: { renderSource: { kind: "image", imageId: "b.png" } },
        },
      },
    );

    expect(run(used, { type: "sweep-unused-images" })).toBe(used);
  });
});

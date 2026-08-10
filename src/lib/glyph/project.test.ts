import { describe, expect, it } from "vitest";
import { projectReducer, type ProjectAction } from "@/lib/glyph/project";
import {
  DEFAULT_FONT_FAMILY,
  createDefaultProject,
} from "@/lib/glyph/defaults";
import type { Project } from "@/lib/glyph/types";

function base(): Project {
  return createDefaultProject("TestFont");
}

describe("createDefaultProject", () => {
  it("seeds the bundled Inter family when no font is given", () => {
    expect(createDefaultProject().font.family).toBe(DEFAULT_FONT_FAMILY);
    expect(DEFAULT_FONT_FAMILY).toBe("Inter");
  });

  it("uses an explicitly provided family", () => {
    expect(createDefaultProject("TestFont").font.family).toBe("TestFont");
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
      { type: "patch-style", scope: project, patch: { textColor: "#ff0000" } },
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
    expect(next.style.textColor).toBe("#ff0000");
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
      patch: { textColor: "#0f0" },
    });
    expect(next.devices[0].glyphStyles).toEqual({
      "key-w": { textColor: "#0f0" },
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
      { type: "patch-style", scope, patch: { textColor: "#0f0" } },
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

describe("projectReducer — font", () => {
  it("updates the registered font family", () => {
    const next = run(base(), { type: "set-font", family: "NewFamily" });
    expect(next.font.family).toBe("NewFamily");
  });
});

describe("projectReducer — Render Source & custom images (#20)", () => {
  const image = { id: "img-1.png", fileName: "art.png", type: "image/png" };

  it("starts with no images and both layers at identity", () => {
    expect(base().images).toEqual([]);
    const identity = { rotation: 0, scale: { x: 1, y: 1 } };
    expect(base().style.content.transform).toEqual(identity);
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
        patch: { renderSource: { kind: "image", imageId: image.id } },
      },
    );
    expect(next.devices[0].glyphStyles["key-w"]).toEqual({
      renderSource: { kind: "image", imageId: image.id },
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
        patch: { renderSource: { kind: "label" } },
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
      patch: { content: { transform: { scale: { x: 0.6, y: 0.6 } } } },
    });
    // The Project tier is a full style, so the patch lands totalled: the axis it
    // named changed and the rotation it didn't is still spelled out.
    expect(next.style.content.transform).toEqual({
      rotation: 0,
      scale: { x: 0.6, y: 0.6 },
    });
  });

  it("stores a Device-tier content transform as a sparse override", () => {
    const next = run(base(), {
      type: "patch-style",
      scope: { tier: "device", deviceIndex: 0 },
      patch: { content: { transform: { rotation: 90 } } },
    });
    // Sparse at an override tier: the scale it didn't name stays absent, so it
    // keeps falling up rather than pinning identity.
    expect(next.devices[0].style).toEqual({
      content: { transform: { rotation: 90 } },
    });
    expect(next.style.content.transform.rotation).toBe(0);
  });
});

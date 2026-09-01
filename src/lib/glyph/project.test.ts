import { describe, expect, it } from "vitest";
import { projectReducer, type ProjectAction } from "@/lib/glyph/project";
import {
  DEFAULT_BACKGROUND,
  DEFAULT_FONT_FAMILY,
  DEFAULT_STYLE,
  createDefaultProject,
} from "@/lib/glyph/defaults";
import type { Preset } from "@/lib/glyph/presets";
import type { StyleOverride } from "@/lib/glyph/style";
import type { Project, SymbolSet } from "@/lib/glyph/types";

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

  it("opens an Xbox Device on the circle its controls actually are", () => {
    const next = run(base(), { type: "toggle-device", catalogId: "xbox" });
    // A Device-tier value, not a seed: the user and a Preset both write over it.
    expect(next.devices[1].style).toEqual({ background: { shape: "circle" } });
    // The Keyboard's keys are the base's rounded rect, so it opens on nothing.
    expect(next.devices[0].style).toEqual({});
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

  // Adding a Device can strand the Project base: `bumper` is authored by the
  // pads and by nothing else, so a Keyboard arriving in a pad-only project
  // leaves a base source it cannot draw (ADR-0014 §4).
  describe("a Project-tier source the new Device cannot draw", () => {
    /** A pad-only project whose base Background draws the bumper tile. */
    function padsWithBumper(): Project {
      return run(
        base(),
        { type: "toggle-device", catalogId: "xbox" },
        { type: "toggle-device", catalogId: "keyboard" },
        {
          type: "patch-style",
          scope: { tier: "project" },
          patch: {
            background: {
              source: { kind: "authored", backgroundId: "bumper" },
            },
          },
        },
      );
    }

    it("copies it down to the Devices already present, and defaults the base", () => {
      const next = run(padsWithBumper(), {
        type: "toggle-device",
        catalogId: "keyboard",
      });

      // The value moved a tier; it did not disappear and nothing restyled.
      expect(next.style.background.source).toEqual(DEFAULT_BACKGROUND.source);
      const xbox = next.devices.find((d) => d.catalogId === "xbox");
      expect(xbox?.style.background?.source).toEqual({
        kind: "authored",
        backgroundId: "bumper",
      });
    });

    it("does not hand the arriving Device a source it cannot draw", () => {
      const next = run(padsWithBumper(), {
        type: "toggle-device",
        catalogId: "keyboard",
      });
      const keyboard = next.devices.find((d) => d.catalogId === "keyboard");
      expect(keyboard?.style.background?.source).toBeUndefined();
    });

    it("leaves a Device that already overrides the field alone", () => {
      // It was ignoring the base anyway, so writing to it would clobber a
      // choice the user made.
      const own = { kind: "shape" } as const;
      const next = run(
        padsWithBumper(),
        {
          type: "patch-style",
          scope: { tier: "device", deviceIndex: 0 },
          patch: { background: { source: own } },
        },
        { type: "toggle-device", catalogId: "keyboard" },
      );
      const xbox = next.devices.find((d) => d.catalogId === "xbox");
      expect(xbox?.style.background?.source).toEqual(own);
    });

    it("leaves the base alone when every Device can draw it", () => {
      const next = run(padsWithBumper(), {
        type: "toggle-device",
        catalogId: "playstation",
      });
      expect(next.style.background.source).toEqual({
        kind: "authored",
        backgroundId: "bumper",
      });
    });

    it("defaults the base when there is no Device to receive it", () => {
      // Nothing was drawing the source either, so this is still no restyle.
      const next = run(
        padsWithBumper(),
        { type: "toggle-device", catalogId: "xbox" },
        { type: "toggle-device", catalogId: "keyboard" },
      );
      expect(next.devices.map((d) => d.catalogId)).toEqual(["keyboard"]);
      expect(next.style.background.source).toEqual(DEFAULT_BACKGROUND.source);
    });
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

describe("projectReducer — applying a Preset (ADR-0012 §3/§4)", () => {
  const KEY_ACCENT: StyleOverride = {
    background: { fill: "#f59e0b" },
    foreground: { textColor: "#1c1917" },
  };

  /** A Device Preset over the Keyboard, sparse and with one inert rule. */
  function keyboardPreset(): Preset {
    return {
      id: "paper",
      label: "Paper",
      kind: "device",
      devices: [
        {
          catalogId: "keyboard",
          style: { foreground: { textColor: "#0f172a" } },
          // `key-f5` is off the Default Selection on purpose: a rule that lands
          // on nothing must still be carried, not dropped.
          glyphStyles: { "key-w": KEY_ACCENT, "key-f5": KEY_ACCENT },
        },
      ],
    };
  }

  /** A Project Preset covering a Device this project has and one it doesn't. */
  function twoDevicePreset(): Preset {
    return {
      id: "arcade",
      label: "Arcade",
      kind: "project",
      style: {
        ...DEFAULT_STYLE,
        foreground: { ...DEFAULT_STYLE.foreground, textColor: "#fde68a" },
      },
      devices: [
        { catalogId: "keyboard", style: {}, glyphStyles: {} },
        {
          catalogId: "xbox",
          style: { background: { shape: "circle" } },
          glyphStyles: {},
        },
      ],
    };
  }

  function apply(project: Project, preset: Preset, taken: string[] = []) {
    return run(project, { type: "apply-preset", preset, taken });
  }

  it("restyles a Device you have and keeps its selection when untaken", () => {
    const edited = run(base(), {
      type: "toggle-input",
      deviceIndex: 0,
      inputId: "key-space",
    });
    const before = edited.devices[0].enabled;

    const next = apply(edited, keyboardPreset());

    expect(next.devices[0].enabled).toEqual(before);
    expect(next.devices[0].style).toEqual({
      foreground: { textColor: "#0f172a" },
    });
    expect(Object.keys(next.devices[0].glyphStyles)).toEqual([
      "key-w",
      "key-f5",
    ]);
  });

  it("replaces the Device's own style rather than merging with what was there", () => {
    const styled = run(
      base(),
      {
        type: "patch-style",
        scope: { tier: "device", deviceIndex: 0 },
        patch: { background: { fill: "#ff0000" } },
      },
      {
        type: "patch-style",
        scope: { tier: "glyph", deviceIndex: 0, glyphId: "key-a" },
        patch: { foreground: { textColor: "#ff0000" } },
      },
    );

    const next = apply(styled, keyboardPreset());

    // Both style tiers are the Preset's; a look you apply is the look you get.
    expect(next.devices[0].style.background).toBeUndefined();
    expect(next.devices[0].glyphStyles["key-a"]).toBeUndefined();
  });

  it("replaces a taken Device's Catalog selection, keeping its custom Inputs", () => {
    const edited = run(
      base(),
      { type: "toggle-input", deviceIndex: 0, inputId: "key-space" },
      { type: "add-custom-input", deviceIndex: 0, label: "Any Key" },
    );

    const next = apply(edited, keyboardPreset(), ["keyboard"]);

    expect(next.devices[0].enabled).toEqual(
      createDefaultProject().devices[0].enabled,
    );
    // A Default Selection is a statement about a Catalog, so it has nothing to
    // say about an off-catalog Input and can't be what deletes one.
    expect(next.devices[0].custom).toEqual([
      { id: "custom-1", label: "Any Key" },
    ]);
  });

  it("creates a taken Device you lack, in Catalog order, from its Default Selection", () => {
    const preset: Preset = {
      ...keyboardPreset(),
      devices: [
        {
          catalogId: "xbox",
          style: { background: { shape: "circle" } },
          glyphStyles: {},
        },
      ],
    };

    const next = apply(base(), preset, ["xbox"]);

    expect(next.devices.map((d) => d.name)).toEqual(["Keyboard", "Xbox"]);
    expect(next.devices[1].enabled).toContain("xbox-a");
    expect(next.devices[1].style).toEqual({ background: { shape: "circle" } });
  });

  it("lands nowhere for a Device you lack and did not take", () => {
    const preset: Preset = {
      ...keyboardPreset(),
      devices: [{ catalogId: "xbox", style: {}, glyphStyles: {} }],
    };

    expect(apply(base(), preset).devices).toEqual(base().devices);
  });

  it("writes the Project tier for a Project Preset, and only for that species", () => {
    const next = apply(base(), twoDevicePreset());
    expect(next.style.foreground.textColor).toBe("#fde68a");

    const deviceSpecies = apply(base(), keyboardPreset());
    expect(deviceSpecies.style).toEqual(base().style);
  });

  it("styles each covered Device it can reach, skipping the ones you lack", () => {
    const next = apply(base(), twoDevicePreset());

    expect(next.devices).toHaveLength(1);
    expect(next.devices[0].catalogId).toBe("keyboard");
  });

  it("touches nothing outside the Style Cascade", () => {
    const before = base();
    const next = apply(before, twoDevicePreset(), ["keyboard", "xbox"]);

    expect(next.name).toBe(before.name);
    expect(next.exportSettings).toEqual(before.exportSettings);
    expect(next.fonts).toEqual(before.fonts);
    expect(next.images).toEqual(before.images);
  });

  it("hands over a detached copy, so the shipped Preset can't be edited through it", () => {
    const preset = keyboardPreset();
    const next = apply(base(), preset);

    expect(next.devices[0].style).not.toBe(preset.devices[0].style);
    expect(next.devices[0].glyphStyles["key-w"]).not.toBe(
      preset.devices[0].glyphStyles["key-w"],
    );
  });
});

describe("projectReducer — imported Symbol Sets (ADR-0015, #39)", () => {
  function set(id: string, ...cellIds: string[]): SymbolSet {
    return {
      id,
      name: `${id}.svg`,
      roleColors: { fill: "#2f9e44", border: "#111111", secondary: "#ffffff" },
      cells: cellIds.map((cellId, i) => ({
        id: cellId,
        label: cellId.toUpperCase(),
        labelEdited: false,
        col: i,
        row: 0,
        roles: ["fill" as const],
        flags: [],
        svg: `<svg viewBox="0 0 256 256"><circle style="fill:#f00"/></svg>`,
      })),
    };
  }

  it("adds a Set the project doesn't have", () => {
    const next = run(base(), { type: "install-set", set: set("mypad", "a") });
    expect(next.sets.map((s) => s.id)).toEqual(["mypad"]);
  });

  it("replaces a Set of the same id in place, which is what a refresh is", () => {
    const before = run(
      base(),
      { type: "install-set", set: set("mypad", "a") },
      { type: "install-set", set: set("other", "z") },
    );
    const next = run(before, {
      type: "install-set",
      set: set("mypad", "a", "b"),
    });
    // Replaced, not appended — the window must not reorder under the importer
    // who just accepted it.
    expect(next.sets.map((s) => s.id)).toEqual(["mypad", "other"]);
    expect(next.sets[0].cells.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("removes a Set and takes every cell with it", () => {
    const before = run(base(), { type: "install-set", set: set("mypad", "a") });
    expect(run(before, { type: "remove-set", setId: "mypad" }).sets).toEqual(
      [],
    );
  });

  it("leaves a Glyph's Symbol id alone when its Set is removed", () => {
    // The Glyph falls back to its label and comes back if the Set does — the
    // same degrade a refresh that stops drawing a cell leaves behind.
    const before = run(base(), { type: "install-set", set: set("mypad", "a") });
    const next = run(before, { type: "remove-set", setId: "mypad" });
    expect(next.devices).toEqual(before.devices);
    expect(next.style).toEqual(before.style);
  });

  it("writes preview colours onto the Set and never onto a style", () => {
    const before = run(base(), { type: "install-set", set: set("mypad", "a") });
    const roleColors = {
      fill: "#123456",
      border: "#000000",
      secondary: "#ffffff",
    };
    const next = run(before, {
      type: "set-role-colors",
      setId: "mypad",
      roleColors,
    });
    expect(next.sets[0].roleColors).toEqual(roleColors);
    // ADR-0014 §4: this surface owns Assets and may never own style.
    expect(next.style).toEqual(before.style);
    expect(next.devices).toEqual(before.devices);
  });

  it("ignores preview colours aimed at a Set the project doesn't have", () => {
    const before = run(base(), { type: "install-set", set: set("mypad", "a") });
    const next = run(before, {
      type: "set-role-colors",
      setId: "ghost",
      roleColors: { fill: "#fff", border: "#fff", secondary: "#fff" },
    });
    expect(next.sets).toEqual(before.sets);
  });
});

describe("add-symbol-input (ADR-0015)", () => {
  /** The Assets window's "Add as Input" on an imported cell. */
  const add = (label: string, symbolId: string) =>
    ({ type: "add-symbol-input", deviceIndex: 0, label, symbolId }) as const;

  it("mints the Input and points it at the Symbol in one go", () => {
    const next = projectReducer(
      createDefaultProject(),
      add("Paddle Left", "paddle-left"),
    );
    const [device] = next.devices;
    const input = device.custom.at(-1)!;
    expect(input.label).toBe("Paddle Left");
    // One action rather than two, because the id is minted in the reducer and
    // the caller never learns it — a follow-up `patch-style` has nothing to key.
    expect(device.glyphStyles[input.id]?.foreground?.renderSource).toEqual({
      kind: "symbol",
      symbolId: "paddle-left",
    });
  });

  it("mints ids the same way a hand-added Input does", () => {
    const next = [
      { type: "add-custom-input", deviceIndex: 0, label: "F5" } as const,
      add("Paddle Left", "paddle-left"),
    ].reduce(projectReducer, createDefaultProject());
    expect(next.devices[0].custom.map((c) => c.id)).toEqual([
      "custom-1",
      "custom-2",
    ]);
  });

  it("ignores a blank label, as the hand-added path does", () => {
    const base = createDefaultProject();
    expect(projectReducer(base, add("   ", "paddle-left"))).toBe(base);
  });

  it("leaves the other Devices alone", () => {
    const base = projectReducer(createDefaultProject(), {
      type: "toggle-device",
      catalogId: "xbox",
    });
    const next = projectReducer(base, add("Paddle Left", "paddle-left"));
    // An Input belongs to one Device and yields one sprite in its atlas, so a
    // press while looking at one Device must not reach the rest (ADR-0015).
    expect(next.devices[1].custom).toEqual([]);
  });
});

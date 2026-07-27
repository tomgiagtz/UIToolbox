import { describe, expect, it } from "vitest";
import {
  generateTilesets,
  resolveDeviceInputs,
  resolveScopeStyle,
} from "@/lib/glyph/generate";
import { isPowerOfTwo } from "@/lib/glyph/packer";
import { projectReducer } from "@/lib/glyph/project";
import { createDefaultProject } from "@/lib/glyph/presets";
import type { DeviceConfig, Project } from "@/lib/glyph/types";

/**
 * A Device whose Inputs are supplied as custom (off-catalog) labels, so a test
 * can pin an exact ordered label list regardless of the Catalog. Enabled Catalog
 * Inputs are exercised via the parity test and the reducer tests.
 */
function device(
  labels: string[],
  name = "Keyboard",
  catalogId = "keyboard",
): DeviceConfig {
  return {
    name,
    catalogId,
    enabled: [],
    custom: labels.map((label, i) => ({ id: `c${i}`, label })),
    style: {},
    glyphStyles: {},
  };
}

function project(over: Partial<Project> = {}): Project {
  return {
    name: "test-glyphs",
    font: { family: "TestFont" },
    textColor: "#ffffff",
    background: {
      shape: "rounded-rect",
      fill: "#000000",
      cornerRadius: 12,
      border: { width: 2, color: "#333333" },
    },
    symbolPaints: { fill: "#ffffff", border: "#ffffff", secondary: "#ffffff" },
    cellSize: 128,
    devices: [device(["A", "Right Stick", "→"])],
    naming: { template: "{device}_{input}", case: "snake" },
    filenameTemplate: "{device}_atlas",
    ...over,
  };
}

/**
 * A one-Device Xbox project holding a face button and a bumper — the pair that
 * separates the Catalog per-Input Background tier from the Device tier (#18).
 */
function xboxProject(): Project {
  return project({
    devices: [
      {
        name: "Xbox",
        catalogId: "xbox",
        enabled: ["xbox-a", "xbox-lb"],
        custom: [],
        style: {},
        glyphStyles: {},
      },
    ],
  });
}

describe("Symbol Render Source threads through the cascade (issue #17)", () => {
  const xbox: DeviceConfig = {
    name: "Xbox",
    catalogId: "xbox",
    enabled: ["xbox-a", "xbox-lb"],
    custom: [{ id: "c0", label: "Paddle" }],
    style: {},
    glyphStyles: {},
  };

  it("resolves each Input's default Symbol id (label-only when unset)", () => {
    const [a, lb, paddle] = resolveDeviceInputs(xbox, project());
    expect(a.symbolId).toBe("a"); // well-known → its Symbol
    expect(lb.symbolId).toBeUndefined(); // bumper → Authored Background (#18)
    expect(paddle.symbolId).toBeUndefined(); // custom → label
  });

  it("carries the Symbol id onto the packed placements for the compositor", () => {
    const [out] = generateTilesets(project({ devices: [xbox] }));
    expect(out.placements.map((p) => p.symbolId)).toEqual([
      "a",
      undefined,
      undefined,
    ]);
  });

  it("threads the bumper's Authored Background id onto the placement style (#18)", () => {
    const [a, lb, paddle] = resolveDeviceInputs(xbox, project());
    // The Catalog per-Input default rides in the resolved Background, not on a
    // separate field like symbolId, so it flows to the compositor for free.
    expect(lb.style.background.backgroundId).toBe("bumper");
    expect(a.style.background.backgroundId).toBeUndefined();
    expect(paddle.style.background.backgroundId).toBeUndefined();

    const [out] = generateTilesets(project({ devices: [xbox] }));
    expect(out.placements.map((p) => p.style.background.backgroundId)).toEqual([
      undefined,
      "bumper",
      undefined,
    ]);
  });
});

describe("generateTilesets", () => {
  it("returns one DeviceOutput per Device", () => {
    const out = generateTilesets(
      project({
        devices: [device(["A"]), device(["A", "B"], "Xbox", "xbox")],
      }),
    );
    expect(out.map((d) => d.device)).toEqual(["Keyboard", "Xbox"]);
  });

  it("derives slug-normalized, templated Sprite Names", () => {
    const [kb] = generateTilesets(project());
    expect(kb.placements.map((p) => p.spriteName)).toEqual([
      "keyboard_a",
      "keyboard_right_stick",
      "keyboard_arrow_right",
    ]);
  });

  it("applies the case style across token boundaries", () => {
    const [kb] = generateTilesets(
      project({ naming: { template: "{device}_{input}", case: "camel" } }),
    );
    expect(kb.placements.map((p) => p.spriteName)).toEqual([
      "keyboardA",
      "keyboardRightStick",
      "keyboardArrowRight",
    ]);
  });

  it("supports the {index} token", () => {
    const [kb] = generateTilesets(
      project({
        devices: [device(["A", "B"])],
        naming: { template: "{input}_{index}", case: "snake" },
      }),
    );
    expect(kb.placements.map((p) => p.spriteName)).toEqual(["a_0", "b_1"]);
  });

  it("produces a power-of-two atlas large enough for all cells", () => {
    const [kb] = generateTilesets(
      project({
        devices: [device(Array(17).fill("A"))],
      }),
    );
    expect(isPowerOfTwo(kb.atlasSize.width)).toBe(true);
    expect(isPowerOfTwo(kb.atlasSize.height)).toBe(true);
    for (const p of kb.placements) {
      expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(kb.atlasSize.width);
      expect(p.rect.y + p.rect.h).toBeLessThanOrEqual(kb.atlasSize.height);
    }
  });

  it("produces non-overlapping cell rects", () => {
    const [kb] = generateTilesets(
      project({ devices: [device(Array(9).fill("A"))] }),
    );
    const rects = kb.placements.map((p) => p.rect);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const disjoint =
          a.x + a.w <= b.x ||
          b.x + b.w <= a.x ||
          a.y + a.h <= b.y ||
          b.y + b.h <= a.y;
        expect(disjoint).toBe(true);
      }
    }
  });

  it("builds TexturePacker frames matching placements and Sprite Names", () => {
    const [kb] = generateTilesets(project());
    const frames = kb.metadata.frames;
    expect(Object.keys(frames)).toEqual(kb.placements.map((p) => p.spriteName));
    for (const p of kb.placements) {
      const f = frames[p.spriteName];
      expect(f.frame).toEqual({
        x: p.rect.x,
        y: p.rect.y,
        w: p.rect.w,
        h: p.rect.h,
      });
      expect(f.rotated).toBe(false);
      expect(f.trimmed).toBe(false);
      expect(f.sourceSize).toEqual({ w: p.rect.w, h: p.rect.h });
      expect(f.spriteSourceSize).toEqual({
        x: 0,
        y: 0,
        w: p.rect.w,
        h: p.rect.h,
      });
    }
  });

  it("records the atlas image + size in TexturePacker meta", () => {
    const [kb] = generateTilesets(project());
    expect(kb.metadata.meta.image).toBe("keyboard_atlas.png");
    expect(kb.metadata.meta.size).toEqual({
      w: kb.atlasSize.width,
      h: kb.atlasSize.height,
    });
    expect(kb.filename).toBe("keyboard_atlas");
  });

  it("disambiguates colliding Sprite Names", () => {
    // Distinct labels that slugify to the same base ("right_stick").
    const [kb] = generateTilesets(
      project({
        devices: [device(["Right Stick", "RIGHT  STICK"])],
        naming: { template: "{input}", case: "snake" },
      }),
    );
    const names = kb.placements.map((p) => p.spriteName);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(["right_stick", "right_stick_2"]);
  });

  it("keeps collision suffixes consistent with the case style", () => {
    const [kb] = generateTilesets(
      project({
        devices: [device(["A", "a"])],
        naming: { template: "{input}", case: "camel" },
      }),
    );
    const names = kb.placements.map((p) => p.spriteName);
    expect(new Set(names).size).toBe(names.length);
    // camelCase has no separator, so the suffix appends directly.
    expect(names).toEqual(["a", "a2"]);
  });
});

describe("parity — the Style Cascade is a no-op at defaults", () => {
  // The frozen labels the tool generated for the Keyboard before the Catalog
  // model. Generation must still emit exactly these, in this order.
  const LEGACY_KEYBOARD = [
    "W",
    "A",
    "S",
    "D",
    "Q",
    "E",
    "R",
    "F",
    "Space",
    "Shift",
    "Ctrl",
    "Alt",
    "Tab",
    "Enter",
    "Esc",
    "↑",
    "↓",
    "←",
    "→",
    "LMB",
    "RMB",
    "1",
    "2",
    "3",
  ];

  it("emits the legacy Keyboard Inputs, in order, for the default project", () => {
    const [kb] = generateTilesets(createDefaultProject("TestFont"));
    expect(kb.placements.map((p) => p.label)).toEqual(LEGACY_KEYBOARD);
  });

  it("resolves every Glyph to the untouched Project style", () => {
    const proj = createDefaultProject("TestFont");
    const base = {
      textColor: proj.textColor,
      background: proj.background,
      symbolPaints: proj.symbolPaints,
    };
    const [kb] = generateTilesets(proj);
    for (const placement of kb.placements) {
      // Empty Device / Catalog / Glyph tiers ⇒ effective style === Project style,
      // so pixels are byte-identical to the pre-cascade output.
      expect(placement.style).toEqual(base);
    }
  });
});

describe("resolveScopeStyle", () => {
  it("returns the Project base at Project scope", () => {
    const proj = createDefaultProject("TestFont");
    expect(resolveScopeStyle(proj, { tier: "project" })).toEqual({
      textColor: proj.textColor,
      background: proj.background,
      symbolPaints: proj.symbolPaints,
    });
  });

  it("folds the Device override in at Device scope", () => {
    const proj = projectReducer(createDefaultProject("TestFont"), {
      type: "patch-style",
      scope: { tier: "device", deviceIndex: 0 },
      patch: { background: { shape: "circle" } },
    });
    const style = resolveScopeStyle(proj, { tier: "device", deviceIndex: 0 });
    expect(style.background.shape).toBe("circle");
    // Unset fields fall up to the Project base.
    expect(style.background.fill).toBe(proj.background.fill);
  });

  it("folds Device then Glyph overrides in at Glyph scope", () => {
    const scope = { tier: "glyph", deviceIndex: 0, glyphId: "key-w" } as const;
    const proj = [
      {
        type: "patch-style",
        scope: { tier: "device", deviceIndex: 0 },
        patch: { background: { shape: "circle" } },
      } as const,
      { type: "patch-style", scope, patch: { textColor: "#0f0" } } as const,
    ].reduce(projectReducer, createDefaultProject("TestFont"));
    const style = resolveScopeStyle(proj, scope);
    expect(style.textColor).toBe("#0f0"); // Glyph tier
    expect(style.background.shape).toBe("circle"); // Device tier
  });

  it("keeps bumpers on their Authored Background under a device-wide shape override (issue #18)", () => {
    // The Catalog per-Input tier outranks the Device tier, so a project-wide
    // "make everything a circle" must not strip the bumper/trigger backers.
    const proj = projectReducer(xboxProject(), {
      type: "patch-style",
      scope: { tier: "device", deviceIndex: 0 },
      patch: { background: { shape: "circle" } },
    });
    const inputs = resolveDeviceInputs(proj.devices[0], proj);
    const lb = inputs.find((i) => i.id === "xbox-lb");
    const a = inputs.find((i) => i.id === "xbox-a");
    expect(lb?.style.background.backgroundId).toBe("bumper");
    expect(lb?.style.background.flipX).toBe(true);
    // A face button has no backer, so it does take the device-wide circle.
    expect(a?.style.background.shape).toBe("circle");
  });

  it("lets an explicit per-Glyph source change override the backer (issue #18)", () => {
    const proj = projectReducer(xboxProject(), {
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "xbox-lb" },
      patch: { background: { backgroundId: null, shape: "circle" } },
    });
    const lb = resolveDeviceInputs(proj.devices[0], proj).find(
      (i) => i.id === "xbox-lb",
    );
    expect(lb?.style.background.backgroundId).toBeUndefined();
    expect(lb?.style.background.shape).toBe("circle");
  });

  it("falls back to the Project base for a missing Device", () => {
    const proj = createDefaultProject("TestFont");
    expect(resolveScopeStyle(proj, { tier: "device", deviceIndex: 9 })).toEqual(
      {
        textColor: proj.textColor,
        background: proj.background,
        symbolPaints: proj.symbolPaints,
      },
    );
  });
});

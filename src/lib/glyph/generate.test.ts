import { describe, expect, it } from "vitest";
import { generateTilesets } from "@/lib/glyph/generate";
import { isPowerOfTwo } from "@/lib/glyph/packer";
import type { Project } from "@/lib/glyph/types";

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
    cellSize: 128,
    devices: [{ name: "Keyboard", inputs: ["A", "Right Stick", "→"] }],
    naming: { template: "{device}_{input}", case: "snake" },
    filenameTemplate: "{device}_atlas",
    ...over,
  };
}

describe("generateTilesets", () => {
  it("returns one DeviceOutput per Device", () => {
    const out = generateTilesets(
      project({
        devices: [
          { name: "Keyboard", inputs: ["A"] },
          { name: "Xbox", inputs: ["A", "B"] },
        ],
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
        devices: [{ name: "Keyboard", inputs: ["A", "B"] }],
        naming: { template: "{input}_{index}", case: "snake" },
      }),
    );
    expect(kb.placements.map((p) => p.spriteName)).toEqual(["a_0", "b_1"]);
  });

  it("produces a power-of-two atlas large enough for all cells", () => {
    const [kb] = generateTilesets(
      project({
        devices: [{ name: "Keyboard", inputs: Array(17).fill("A") }],
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
      project({ devices: [{ name: "Keyboard", inputs: Array(9).fill("A") }] }),
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
        devices: [
          { name: "Keyboard", inputs: ["Right Stick", "RIGHT  STICK"] },
        ],
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
        devices: [{ name: "Keyboard", inputs: ["A", "a"] }],
        naming: { template: "{input}", case: "camel" },
      }),
    );
    const names = kb.placements.map((p) => p.spriteName);
    expect(new Set(names).size).toBe(names.length);
    // camelCase has no separator, so the suffix appends directly.
    expect(names).toEqual(["a", "a2"]);
  });
});

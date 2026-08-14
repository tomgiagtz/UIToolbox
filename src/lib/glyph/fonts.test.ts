import { describe, expect, it } from "vitest";
import { DEFAULT_FONT_FAMILY } from "@/lib/glyph/bundled-fonts";
import { createDefaultProject } from "@/lib/glyph/defaults";
import {
  fontAssetFor,
  isKnownFamily,
  nextFontFileName,
  pickableFonts,
} from "@/lib/glyph/fonts";
import type { FontAsset, Project } from "@/lib/glyph/types";

function withFonts(fonts: FontAsset[]): Project {
  return { ...createDefaultProject(), fonts };
}

describe("nextFontFileName — uniqueness minted at upload (ADR-0012 §7)", () => {
  it("keeps the original name when nothing has claimed it", () => {
    expect(nextFontFileName([], "Regular.woff2")).toBe("Regular.woff2");
  });

  it("suffixes a collision, keeping the extension", () => {
    const fonts: FontAsset[] = [{ family: "A", fileName: "Regular.woff2" }];
    expect(nextFontFileName(fonts, "Regular.woff2")).toBe("Regular-2.woff2");
  });

  it("keeps counting past an existing suffix", () => {
    const fonts: FontAsset[] = [
      { family: "A", fileName: "Regular.woff2" },
      { family: "B", fileName: "Regular-2.woff2" },
    ];
    expect(nextFontFileName(fonts, "Regular.woff2")).toBe("Regular-3.woff2");
  });

  it("handles a name with no extension", () => {
    const fonts: FontAsset[] = [{ family: "A", fileName: "Regular" }];
    expect(nextFontFileName(fonts, "Regular")).toBe("Regular-2");
  });

  it("leaves a name that only differs by extension alone", () => {
    const fonts: FontAsset[] = [{ family: "A", fileName: "Regular.woff2" }];
    expect(nextFontFileName(fonts, "Regular.ttf")).toBe("Regular.ttf");
  });
});

describe("fontAssetFor", () => {
  it("pairs the registered family with a disambiguated file name", () => {
    const fonts: FontAsset[] = [{ family: "old", fileName: "Regular.ttf" }];
    expect(fontAssetFor(fonts, "UITBFont-1-abc", "Regular.ttf")).toEqual({
      family: "UITBFont-1-abc",
      fileName: "Regular-2.ttf",
    });
  });
});

describe("pickableFonts — bundled ∪ manifest (ADR-0012 §6)", () => {
  it("offers the bundled set to a fresh project, which manifests nothing", () => {
    const project = createDefaultProject();
    expect(project.fonts).toEqual([]);
    const picks = pickableFonts(project);
    expect(picks.every((p) => p.bundled)).toBe(true);
    expect(picks[0]).toEqual({
      family: DEFAULT_FONT_FAMILY,
      label: DEFAULT_FONT_FAMILY,
      bundled: true,
    });
  });

  it("appends uploads, labelled by filename rather than minted family", () => {
    const project = withFonts([
      { family: "UITBFont-1-abc", fileName: "Comic.ttf" },
    ]);
    const upload = pickableFonts(project).at(-1);
    expect(upload).toEqual({
      family: "UITBFont-1-abc",
      label: "Comic.ttf",
      bundled: false,
    });
  });
});

describe("isKnownFamily", () => {
  it("knows a bundled family with nothing uploaded", () => {
    expect(isKnownFamily(createDefaultProject(), DEFAULT_FONT_FAMILY)).toBe(
      true,
    );
  });

  it("knows a manifested upload", () => {
    const project = withFonts([
      { family: "UITBFont-1-abc", fileName: "C.ttf" },
    ]);
    expect(isKnownFamily(project, "UITBFont-1-abc")).toBe(true);
  });

  it("rejects a family in neither set", () => {
    expect(isKnownFamily(createDefaultProject(), "Wingdings")).toBe(false);
    expect(isKnownFamily(createDefaultProject(), "")).toBe(false);
  });
});

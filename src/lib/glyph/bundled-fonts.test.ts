// @vitest-environment node
//
// The registry is plain data, but the point of this suite is the *files* it
// names, so it reads `public/fonts/` off disk.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUNDLED_FONTS,
  DEFAULT_FONT_FAMILY,
  bundledFontUrl,
  bundledLicenseFile,
  getBundledFont,
} from "@/lib/glyph/bundled-fonts";

const FONT_DIR = join(process.cwd(), "public", "fonts");

describe("BUNDLED_FONTS — the shipped set (#76)", () => {
  it("names a file that exists for every family", () => {
    // Worth having because loading is lazy for every row but the first: a
    // mistyped filename no longer fails at startup where someone would notice
    // it — it 404s on first use and silently degrades to the browser's default
    // face, which looks fine and is wrong.
    const missing = BUNDLED_FONTS.filter(
      (font) => !existsSync(join(FONT_DIR, font.file)),
    ).map((font) => font.file);
    expect(missing).toEqual([]);
  });

  it("ships a licence beside every family", () => {
    // The only mechanism that would ever notice a missing licence, which is the
    // part of vendoring with legal weight (all five are OFL 1.1).
    const missing = BUNDLED_FONTS.map(bundledLicenseFile).filter(
      (file) => !existsSync(join(FONT_DIR, file)),
    );
    expect(missing).toEqual([]);
  });

  it("uses each family name exactly once", () => {
    const families = BUNDLED_FONTS.map((f) => f.family);
    expect(new Set(families).size).toBe(families.length);
  });

  it("defaults to the first row, so the default is always a bundled family", () => {
    expect(DEFAULT_FONT_FAMILY).toBe(BUNDLED_FONTS[0].family);
    expect(getBundledFont(DEFAULT_FONT_FAMILY)).toBe(BUNDLED_FONTS[0]);
  });

  it("does not resolve an uploaded family", () => {
    expect(getBundledFont("UITBFont-1234-abcdef")).toBeUndefined();
  });

  it("serves each file from /fonts", () => {
    expect(bundledFontUrl(BUNDLED_FONTS[0])).toBe(
      `/fonts/${BUNDLED_FONTS[0].file}`,
    );
  });
});

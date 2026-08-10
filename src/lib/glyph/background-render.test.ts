import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GlyphStyle } from "@/lib/glyph/style";
import type { BackgroundSource } from "@/lib/glyph/types";
import { identityTransform } from "@/lib/glyph/defaults";

// The two bitmap caches a tile can come from. Rasterizing needs a browser, so the
// caches are stubbed and what's asserted is the routing: an Authored Background
// must be recoloured through the Symbol cache, an uploaded tile drawn as authored
// from the image cache — never the other way around.
vi.mock("@/lib/glyph/symbol-render", () => ({
  getBackgroundBitmap: vi.fn(() => "authored-bitmap"),
  ensureBackgroundBitmap: vi.fn(async () => "authored-bitmap"),
}));
vi.mock("@/lib/glyph/images", () => ({
  getImageBitmap: vi.fn(() => "image-bitmap"),
  ensureImageBitmap: vi.fn(async () => "image-bitmap"),
}));

const { getTileBitmap, ensureTileBitmap } =
  await import("@/lib/glyph/background-render");
const { getBackgroundBitmap, ensureBackgroundBitmap } =
  await import("@/lib/glyph/symbol-render");
const { getImageBitmap, ensureImageBitmap } =
  await import("@/lib/glyph/images");

function styleWith(source: BackgroundSource): GlyphStyle {
  return {
    textColor: "#ffffff",
    background: {
      source,
      transform: identityTransform(),
      shape: "rounded-rect",
      fill: "#1e293b",
      cornerRadius: 18,
      border: { width: 4, color: "#475569" },
    },
    symbolPaints: { fill: "#ffffff", border: "#ffffff", secondary: "#ffffff" },
    content: { transform: identityTransform() },
  };
}

describe("tile bitmaps by Background source (issue #22)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("draws no tile for a plain shape", async () => {
    const style = styleWith({ kind: "shape" });
    expect(getTileBitmap(style, 128)).toBeUndefined();
    await expect(ensureTileBitmap(style, 128)).resolves.toBeNull();
    expect(ensureBackgroundBitmap).not.toHaveBeenCalled();
    expect(ensureImageBitmap).not.toHaveBeenCalled();
  });

  it("resolves an Authored Background through the recolouring cache", async () => {
    const style = styleWith({ kind: "authored", backgroundId: "bumper" });
    expect(getTileBitmap(style, 128, "xbox")).toBe("authored-bitmap");
    // The Device scopes the art: both pads author their own `bumper`.
    expect(getBackgroundBitmap).toHaveBeenCalledWith(
      "bumper",
      style,
      128,
      "xbox",
    );
    await ensureTileBitmap(style, 128, "xbox");
    expect(ensureBackgroundBitmap).toHaveBeenCalledWith(
      "bumper",
      style,
      128,
      "xbox",
    );
    expect(getImageBitmap).not.toHaveBeenCalled();
  });

  it("resolves an uploaded tile from the image registry, uncoloured", async () => {
    const style = styleWith({ kind: "image", imageId: "img-1.png" });
    expect(getTileBitmap(style, 128, "xbox")).toBe("image-bitmap");
    // No style and no device: the user's art draws as authored, everywhere.
    expect(getImageBitmap).toHaveBeenCalledWith("img-1.png", 128);
    await ensureTileBitmap(style, 128, "xbox");
    expect(ensureImageBitmap).toHaveBeenCalledWith("img-1.png", 128);
    expect(getBackgroundBitmap).not.toHaveBeenCalled();
  });
});

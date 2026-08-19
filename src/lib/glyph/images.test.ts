import { afterEach, describe, expect, it } from "vitest";
import {
  clearImages,
  forgetImage,
  ensureImageBitmap,
  getImageBitmap,
  getImageBlob,
  hasImage,
  type ImageAppearance,
  imageAppearanceKey,
  imageAssetFor,
  mintImageId,
  putImage,
} from "@/lib/glyph/images";

afterEach(() => clearImages());

describe("mintImageId — ids are minted, never counted (ADR-0014 §6)", () => {
  it("keeps a readable stem from the upload's filename, and its extension", () => {
    expect(mintImageId("Arrow Up.png")).toMatch(/^arrow_up-[a-z0-9]+\.png$/);
    expect(mintImageId("logo.SVG")).toMatch(/^logo-[a-z0-9]+\.svg$/);
  });

  it("reads a hyphen in the filename as a word gap, not as 'minus'", () => {
    // `slugify` spells punctuation out for Sprite Names, where `-` is an Input
    // a player presses. In a filename it is only a gap, and `test_minus_image`
    // is not the name the user recognises.
    expect(mintImageId("test-image.svg")).toMatch(
      /^test_image-[a-z0-9]+\.svg$/,
    );
  });

  it("never returns the same id twice for the same filename", () => {
    // The whole point: an id freed by a removal must not come back. Counting
    // above the manifest did exactly that, because removal shrinks the manifest.
    const ids = new Set(
      Array.from({ length: 50 }, () => mintImageId("same.png")),
    );
    expect(ids.size).toBe(50);
  });

  it("takes no manifest, so the manifest cannot influence the id", () => {
    // Stated as a test because it is the fix: the previous allocator read the
    // manifest to find the highest number, and removal shrinks the manifest.
    expect(mintImageId).toHaveLength(1);
  });

  it("falls back to a generic extension when the filename has none", () => {
    expect(mintImageId("clipboard")).toMatch(/^clipboard-[a-z0-9]+\.img$/);
  });

  // "~" is unmapped punctuation, so it separates tokens and leaves none behind.
  // ("???" would not do: slugify expands "?" to the word "question".)
  it("falls back to a generic stem when nothing normalizable is left", () => {
    expect(mintImageId("~~~.png")).toMatch(/^glyph-[a-z0-9]+\.png$/);
  });
});

describe("imageAssetFor", () => {
  it("builds the manifest entry for an upload", () => {
    const file = new File([new Uint8Array([1, 2])], "My Art.PNG", {
      type: "image/png",
    });
    expect(imageAssetFor(file)).toEqual({
      id: expect.stringMatching(/^my_art-[a-z0-9]+\.png$/),
      fileName: "My Art.PNG",
      type: "image/png",
    });
  });
});

describe("the runtime image registry", () => {
  it("stores and returns a blob by id", () => {
    const blob = new Blob(["art"]);
    putImage("img-1.png", blob);
    expect(hasImage("img-1.png")).toBe(true);
    expect(getImageBlob("img-1.png")).toBe(blob);
  });

  it("reports an unknown id as absent", () => {
    expect(hasImage("img-9.png")).toBe(false);
    expect(getImageBlob("img-9.png")).toBeUndefined();
  });

  it("forgets one image without touching the others", () => {
    putImage("a.png", new Blob(["a"]));
    putImage("b.png", new Blob(["b"]));
    forgetImage("a.png");
    expect(hasImage("a.png")).toBe(false);
    expect(hasImage("b.png")).toBe(true);
  });

  it("drops everything on clear", () => {
    putImage("img-1.png", new Blob(["art"]));
    clearImages();
    expect(hasImage("img-1.png")).toBe(false);
  });
});

describe("imageAppearanceKey", () => {
  const base: ImageAppearance = { id: "img-1.png", size: 128 };

  it("keys a different image separately", () => {
    expect(imageAppearanceKey({ ...base, id: "img-2.png" })).not.toBe(
      imageAppearanceKey(base),
    );
  });

  it("keys a different cell size separately", () => {
    // The bitmap is decoded at the size, so sharing a key would draw an
    // upscaled bitmap from the previous cell size.
    expect(imageAppearanceKey({ ...base, size: 64 })).not.toBe(
      imageAppearanceKey(base),
    );
  });

  it("keys two equal appearances the same, so they share one decode", () => {
    expect(imageAppearanceKey({ ...base })).toBe(imageAppearanceKey(base));
  });

  it("takes nothing but the id and the size", () => {
    // Notably not the content transform: the renderer transforms at draw time,
    // so dragging a scale slider must not re-rasterize. Guarding the whole key
    // rather than one absent field — anything added to the appearance has to
    // earn its place here.
    expect(Object.keys(base)).toEqual(["id", "size"]);
    expect(imageAppearanceKey(base)).toBe("img-1.png|128");
  });
});

describe("image rasterization", () => {
  it("resolves to null for an id with no bytes", async () => {
    await expect(ensureImageBitmap("img-9.png", 128)).resolves.toBeNull();
  });

  it("resolves to null where rasterization is unavailable (jsdom / SSR)", async () => {
    // The draw path then falls back to the Symbol or label rather than blanking.
    putImage("img-1.png", new Blob(["art"], { type: "image/png" }));
    await expect(ensureImageBitmap("img-1.png", 128)).resolves.toBeNull();
    expect(getImageBitmap("img-1.png", 128)).toBeUndefined();
  });
});

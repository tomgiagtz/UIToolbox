import { afterEach, describe, expect, it } from "vitest";
import {
  clearImages,
  ensureImageBitmap,
  getImageBitmap,
  getImageBlob,
  hasImage,
  imageAssetFor,
  nextImageId,
  putImage,
} from "@/lib/glyph/images";
import type { ImageAsset } from "@/lib/glyph/types";

afterEach(() => clearImages());

function asset(id: string): ImageAsset {
  return { id, fileName: `${id}`, type: "image/png" };
}

describe("nextImageId", () => {
  it("numbers from 1 and keeps the upload's extension", () => {
    expect(nextImageId([], "arrow.png")).toBe("img-1.png");
    expect(nextImageId([], "logo.SVG")).toBe("img-1.svg");
  });

  it("counts past the highest existing id, not the asset count", () => {
    // Ids outlive the assets that used them (an image can be removed), so a
    // reused id would silently repoint some other Glyph's Render Source.
    const images = [asset("img-1.png"), asset("img-7.svg")];
    expect(nextImageId(images, "next.png")).toBe("img-8.png");
  });

  it("falls back to a generic extension when the filename has none", () => {
    expect(nextImageId([], "clipboard")).toBe("img-1.img");
  });
});

describe("imageAssetFor", () => {
  it("builds the manifest entry for an upload", () => {
    const file = new File([new Uint8Array([1, 2])], "My Art.PNG", {
      type: "image/png",
    });
    expect(imageAssetFor([], file)).toEqual({
      id: "img-1.png",
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

  it("drops everything on clear", () => {
    putImage("img-1.png", new Blob(["art"]));
    clearImages();
    expect(hasImage("img-1.png")).toBe(false);
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

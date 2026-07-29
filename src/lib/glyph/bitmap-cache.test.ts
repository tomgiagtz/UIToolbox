import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canRasterize,
  createBitmapCache,
  decodeToBitmap,
} from "@/lib/glyph/bitmap-cache";

/**
 * A stand-in for a decoded bitmap. Nothing here draws, so the cache only ever
 * has to hand back the identical object it was given.
 */
function fakeBitmap(label: string): ImageBitmap {
  return { label } as unknown as ImageBitmap;
}

/**
 * A cache whose appearance key is already a string, so each test says only what
 * it is about: how often `rasterize` runs.
 */
function stringKeyCache(
  rasterize: (key: string) => Promise<ImageBitmap | null>,
) {
  return createBitmapCache((key: string) => key, rasterize);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createBitmapCache", () => {
  it("decodes once per key and serves later gets from the cache", async () => {
    const rasterize = vi.fn(async () => fakeBitmap("a"));
    const cache = stringKeyCache(rasterize);

    const first = await cache.ensure("one");
    expect(cache.get("one")).toBe(first);
    await cache.ensure("one");

    expect(rasterize).toHaveBeenCalledTimes(1);
  });

  it("shares one decode between concurrent callers for the same key", async () => {
    let release!: (bitmap: ImageBitmap) => void;
    const rasterize = vi.fn(
      () => new Promise<ImageBitmap | null>((resolve) => (release = resolve)),
    );
    const cache = stringKeyCache(rasterize);

    const both = Promise.all([cache.ensure("one"), cache.ensure("one")]);
    release(fakeBitmap("a"));
    const [left, right] = await both;

    expect(rasterize).toHaveBeenCalledTimes(1);
    expect(left).toBe(right);
  });

  it("keys on the flattened key, not the identity of the key object", async () => {
    const rasterize = vi.fn(async ({ id }: { id: string }) => fakeBitmap(id));
    const cache = createBitmapCache(({ id }: { id: string }) => id, rasterize);

    const first = await cache.ensure({ id: "one" });
    expect(cache.get({ id: "one" })).toBe(first);
    expect(rasterize).toHaveBeenCalledTimes(1);

    await cache.ensure({ id: "two" });
    expect(rasterize).toHaveBeenCalledTimes(2);
  });

  it("caches nothing for a key with nothing to draw, and retries it", async () => {
    // A `null` is a missing Render Source, not a decoded appearance: registering
    // the bytes later has to start drawing without anyone clearing the cache.
    const rasterize = vi.fn(async () => null);
    const cache = stringKeyCache(rasterize);

    await expect(cache.ensure("one")).resolves.toBeNull();
    expect(cache.get("one")).toBeUndefined();
    await cache.ensure("one");

    expect(rasterize).toHaveBeenCalledTimes(2);
  });

  it("resolves null on a failed decode rather than rejecting", async () => {
    // The draw path can't handle a rejection — a broken source falls back to the
    // label instead.
    const rasterize = vi.fn(async () => {
      throw new Error("decode blew up");
    });
    const cache = stringKeyCache(rasterize);

    await expect(cache.ensure("one")).resolves.toBeNull();
    expect(cache.get("one")).toBeUndefined();
  });

  it("forgets decoded bitmaps on clear", async () => {
    const rasterize = vi.fn(async () => fakeBitmap("a"));
    const cache = stringKeyCache(rasterize);

    await cache.ensure("one");
    cache.clear();

    expect(cache.get("one")).toBeUndefined();
    await cache.ensure("one");
    expect(rasterize).toHaveBeenCalledTimes(2);
  });

  it("never evicts — every key it is given stays until clear()", async () => {
    // Pinning the policy: there is no capacity. Appearances are few (a Symbol
    // Set at a handful of sizes), so the cache is deliberately unbounded and
    // callers drop it wholesale.
    const rasterize = vi.fn(async (key: string) => fakeBitmap(key));
    const cache = stringKeyCache(rasterize);

    for (let i = 0; i < 200; i++) await cache.ensure(`k${i}`);

    expect(cache.get("k0")).toBeDefined();
    expect(rasterize).toHaveBeenCalledTimes(200);
  });
});

describe("canRasterize", () => {
  it("is false under jsdom, which has no createImageBitmap", () => {
    expect(canRasterize()).toBe(false);
  });

  it("is true once every piece of the decode path is present", () => {
    // jsdom is missing two of them: createImageBitmap and URL.createObjectURL.
    stubDecodePath({ width: 1, height: 1 });
    expect(canRasterize()).toBe(true);
  });
});

describe("decodeToBitmap", () => {
  it("resolves null where rasterization is unavailable (jsdom / SSR)", async () => {
    // The renderers depend on this: no bitmap means fall back to the plain
    // shape or label, never throw.
    const blob = new Blob(["<svg/>"], { type: "image/svg+xml" });
    await expect(decodeToBitmap(blob)).resolves.toBeNull();
  });

  it("decodes through an <img> and revokes the object URL", async () => {
    const { createImageBitmap, revoke } = stubDecodePath({
      width: 40,
      height: 10,
    });
    const bitmap = await decodeToBitmap(new Blob(["art"]));

    expect(bitmap).toEqual(fakeBitmap("decoded"));
    // No resize requested, so the natural size is decoded as-is.
    expect(createImageBitmap.mock.calls[0][1]).toBeUndefined();
    expect(revoke).toHaveBeenCalledWith("blob:stub");
  });

  it("passes a resize the natural size and decodes at what it returns", async () => {
    const { createImageBitmap } = stubDecodePath({ width: 40, height: 10 });
    const resize = vi.fn(() => ({ width: 8, height: 2 }));

    await decodeToBitmap(new Blob(["art"]), resize);

    expect(resize).toHaveBeenCalledWith({ width: 40, height: 10 });
    expect(createImageBitmap.mock.calls[0][1]).toMatchObject({
      resizeWidth: 8,
      resizeHeight: 2,
    });
  });

  it("revokes the object URL even when the decode fails", async () => {
    const { revoke } = stubDecodePath({ width: 1, height: 1 }, "img-decode");
    await expect(decodeToBitmap(new Blob(["art"]))).rejects.toThrow(
      "img-decode",
    );
    // The cache turns the rejection into a null; the URL must not leak first.
    expect(revoke).toHaveBeenCalledWith("blob:stub");
  });
});

/**
 * Stand in for the browser decode path jsdom lacks: an `<img>` whose `decode()`
 * resolves at a given natural size, plus object-URL and `createImageBitmap`
 * spies. Pass `failWith` to make the decode reject.
 */
function stubDecodePath(
  natural: { width: number; height: number },
  failWith?: string,
) {
  const revoke = vi.fn();
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:stub"),
    revokeObjectURL: revoke,
  });
  vi.stubGlobal(
    "Image",
    class {
      decoding = "";
      src = "";
      naturalWidth = natural.width;
      naturalHeight = natural.height;
      decode() {
        return failWith
          ? Promise.reject(new Error(failWith))
          : Promise.resolve();
      }
    },
  );
  const createImageBitmap = vi.fn<
    (source: unknown, options?: ImageBitmapOptions) => Promise<ImageBitmap>
  >(async () => fakeBitmap("decoded"));
  vi.stubGlobal("createImageBitmap", createImageBitmap);
  return { createImageBitmap, revoke };
}

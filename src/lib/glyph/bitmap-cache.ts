/**
 * The shared decode-once cache behind every rasterized Render Source.
 *
 * Symbols, Authored Background tiles, and custom images all reach the canvas the
 * same way — some source is turned into an {@link ImageBitmap} at a resolved
 * appearance and drawn — and they all need the same three things:
 *
 * - **one decode per appearance**, since the preview redraws constantly;
 * - **a synchronous read** for the draw path, which can't await, plus an async
 *   warm the caller runs first (see `useRenderSourceBitmaps`);
 * - **a no-op fallback** where rasterization isn't available at all (SSR /
 *   jsdom), so the renderer falls back to the label instead of throwing.
 *
 * What differs between them is only the key and how the bytes are decoded, so
 * that is all a caller supplies.
 */

/** Whether this environment can rasterize at all — false under SSR and jsdom. */
export function canRasterize(): boolean {
  return (
    typeof createImageBitmap === "function" &&
    typeof Image !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function"
  );
}

/**
 * A decode-once bitmap cache over some appearance key.
 *
 * `Key` is whatever identifies one drawable appearance to the caller (a Symbol
 * id plus its resolved role colours, an image id plus its size); `toCacheKey`
 * flattens it to a string and `rasterize` produces the bitmap, or `null` when
 * there's nothing to draw.
 */
export interface BitmapCache<Key> {
  /** The cached bitmap for this appearance, or `undefined` if not yet decoded. */
  get(key: Key): ImageBitmap | undefined;
  /**
   * Decode (once) and cache this appearance. Concurrent callers for the same
   * appearance share the one decode; a failure resolves `null` rather than
   * rejecting, since a missing Render Source is a fallback, not an error.
   */
  ensure(key: Key): Promise<ImageBitmap | null>;
  /** Forget every decoded bitmap. */
  clear(): void;
}

export function createBitmapCache<Key>(
  toCacheKey: (key: Key) => string,
  rasterize: (key: Key) => Promise<ImageBitmap | null>,
): BitmapCache<Key> {
  const cache = new Map<string, ImageBitmap>();
  const inFlight = new Map<string, Promise<ImageBitmap | null>>();

  return {
    get(key) {
      return cache.get(toCacheKey(key));
    },

    ensure(key) {
      const id = toCacheKey(key);
      const cached = cache.get(id);
      if (cached) return Promise.resolve(cached);

      const pending = inFlight.get(id);
      if (pending) return pending;

      const load = rasterize(key)
        .then((bitmap) => {
          if (bitmap) cache.set(id, bitmap);
          inFlight.delete(id);
          return bitmap;
        })
        .catch(() => {
          inFlight.delete(id);
          return null;
        });
      inFlight.set(id, load);
      return load;
    },

    clear() {
      cache.clear();
      inFlight.clear();
    },
  };
}

/**
 * Decode an SVG string or image blob into a bitmap through an `<img>`, optionally
 * resized. The `<img>` round-trip (rather than decoding a Blob directly) is what
 * makes SVG sources work alongside raster ones.
 *
 * Returns `null` where rasterization isn't available.
 */
export async function decodeToBitmap(
  source: Blob,
  resize?: (natural: { width: number; height: number }) => {
    width: number;
    height: number;
  },
): Promise<ImageBitmap | null> {
  if (!canRasterize()) return null;

  const url = URL.createObjectURL(source);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    if (!resize) return await createImageBitmap(img);
    const { width, height } = resize({
      width: img.naturalWidth,
      height: img.naturalHeight,
    });
    return await createImageBitmap(img, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: "high",
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

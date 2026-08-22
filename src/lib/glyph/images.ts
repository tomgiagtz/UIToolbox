/**
 * Custom images as a Glyph's Render Source (ADR-0004, issue #20).
 *
 * An uploaded image is split in two: the {@link ImageAsset} manifest entry lives
 * in the project config (so a Glyph can reference it by id), while the bytes live
 * here — a runtime registry the draw path reads from. The same bytes are also
 * persisted to IndexedDB and bundled into the project ZIP (ADR-0008); this module
 * is what both of those restore *into*.
 *
 * A Glyph whose image has no bytes registered draws its Symbol or label instead:
 * every lookup here returns `undefined`/`null` rather than throwing, so a config
 * that outlives its assets degrades quietly.
 */
import { createBitmapCache, decodeToBitmap } from "@/lib/glyph/bitmap-cache";
import { slugify } from "@/lib/glyph/slugify";
import type { ImageAsset } from "@/lib/glyph/types";

/** Extension used when an upload's filename doesn't carry one. */
const FALLBACK_EXTENSION = "img";

/**
 * Mint an image id: `<stem>-<tag>.<ext>`, unique by construction (ADR-0014 §6).
 *
 * It takes the **filename and nothing else**. That is the fix, not a
 * simplification: the previous allocator numbered `img-<n>` above the highest id
 * *in the manifest*, which is the one collection removing an image shrinks.
 * Remove the highest-numbered image, upload another, and it took the freed id —
 * so any override still naming the old one silently drew art the project never
 * contained, which is the failure ADR-0011 exists to prevent. An id that cannot
 * be derived from the manifest cannot be freed by editing it.
 *
 * The stem is the upload's filename because that is the name the user
 * recognises, and it stays true however many Glyphs point at the image — unlike
 * a Device or Input, which an image cannot honestly carry, being project-level
 * and usable as one Glyph's Render Source and another's tile at once. It is run
 * through {@link slugify} for the same reason a Sprite Name is: the id doubles as
 * the entry name inside a project ZIP. The extension is kept so anyone unzipping
 * a project by hand gets a file their OS recognises.
 *
 * Hyphens are spaces here, not the word "minus". A Sprite Name spells its
 * punctuation out because `+` and `-` are Inputs a player presses; a filename's
 * hyphen is only a word gap, and `my_minus_icon` is not the name the user
 * recognises.
 */
export function mintImageId(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const ext =
    dot > 0 ? fileName.slice(dot + 1).toLowerCase() : FALLBACK_EXTENSION;
  const stem = slugify(
    (dot > 0 ? fileName.slice(0, dot) : fileName).replaceAll("-", " "),
  );
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `${stem}-${tag}.${ext}`;
}

/** The manifest entry for a newly uploaded `file`, with a freshly minted id. */
export function imageAssetFor(file: File): ImageAsset {
  return {
    id: mintImageId(file.name),
    fileName: file.name,
    type: file.type,
  };
}

// --- Runtime registry ------------------------------------------------------

const blobs = new Map<string, Blob>();

/** Register an image's bytes under its {@link ImageAsset} id. */
export function putImage(id: string, blob: Blob): void {
  blobs.set(id, blob);
}

/** The registered bytes for an image id, or `undefined` if none are loaded. */
export function getImageBlob(id: string): Blob | undefined {
  return blobs.get(id);
}

/** Whether bytes for this image id are loaded and drawable. */
export function hasImage(id: string): boolean {
  return blobs.has(id);
}

/**
 * Forget one image's bytes, as a removal does (ADR-0014 §6).
 *
 * The whole bitmap cache goes with it rather than the one key. A cache key is
 * `id|size` and nothing here knows which sizes are warm, removal is rare, and the
 * cache refills on the next draw — where the alternative, a per-key eviction on
 * {@link BitmapCache}, would land on Symbols and Authored Backgrounds that have
 * no removal to serve it.
 */
export function forgetImage(id: string): void {
  blobs.delete(id);
  bitmaps.clear();
}

/** Forget every registered image (and its rasterized bitmaps). */
export function clearImages(): void {
  blobs.clear();
  bitmaps.clear();
}

// --- Rasterization cache ---------------------------------------------------
//
// Unlike a Symbol, a custom image has no resolved colours — it draws as authored
// — so its appearance is just its id and the cell size. The content transform
// isn't part of it either: the renderer transforms at draw time, so dragging a
// scale slider never re-rasterizes.

/** One custom image's drawable appearance. */
export interface ImageAppearance {
  id: string;
  /** Cell edge in px; the bitmap is decoded with headroom above it. */
  size: number;
}

/**
 * Flatten an appearance to its cache key. Every field that changes what the
 * bitmap looks like has to appear here, or two appearances share one decode and
 * the wrong art draws — hence the direct test. The content transform is
 * deliberately not one of them (see above).
 */
export function imageAppearanceKey({ id, size }: ImageAppearance): string {
  return `${id}|${size}`;
}

/**
 * Headroom factor on the rasterized size, so a content layer scaled above 1 still
 * draws from more pixels than the cell has rather than upscaling a cell-sized
 * bitmap.
 */
const OVERSAMPLE = 2;

const bitmaps = createBitmapCache<ImageAppearance>(
  imageAppearanceKey,
  ({ id, size }) => {
    const blob = blobs.get(id);
    if (!blob) return Promise.resolve(null);
    return decodeToBitmap(blob, (natural) =>
      fitWithin(natural, size * OVERSAMPLE),
    );
  },
);

/**
 * The already-rasterized bitmap for an image at a cell size, or `undefined` if it
 * isn't loaded yet. Synchronous, for the draw path; warm it first with
 * {@link ensureImageBitmap}.
 */
export function getImageBitmap(
  id: string,
  size: number,
): ImageBitmap | undefined {
  return bitmaps.get({ id, size });
}

/**
 * Rasterize (and cache) a registered image for a cell size, resolving to the
 * bitmap — or `null` when the image has no registered bytes or rasterization
 * isn't available (SSR / test).
 */
export function ensureImageBitmap(
  id: string,
  size: number,
): Promise<ImageBitmap | null> {
  return bitmaps.ensure({ id, size });
}

/**
 * Scale a natural size so its longest edge is `max`, preserving aspect. An image
 * with no intrinsic size (some SVGs report 0) falls back to a square, which the
 * renderer then fits like any other.
 */
function fitWithin(
  natural: { width: number; height: number },
  max: number,
): { width: number; height: number } {
  const { width: w, height: h } = natural;
  if (!(w > 0) || !(h > 0)) return { width: max, height: max };
  const scale = max / Math.max(w, h);
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

import {
  DEFAULT_FONT_FAMILY,
  bundledFontUrl,
  getBundledFont,
} from "@/lib/glyph/bundled-fonts";
import {
  isVariableWeight,
  readWeightAxis,
  staticWeight,
  type WeightAxis,
} from "@/lib/glyph/font-axes";

/**
 * The weight axis of every registered family, read from its bytes.
 *
 * A runtime registry rather than a config field, the way image bytes are: the
 * file is the only authority on what weights it contains, so re-deriving it at
 * every registration keeps the manifest from carrying a claim that could
 * disagree with the font it describes. Restore and ZIP import both re-register,
 * so this refills on reload without being persisted.
 */
const weightAxes = new Map<string, WeightAxis>();

/**
 * The weight axis for a registered family, or `undefined` if nothing has been
 * registered under it yet — a lazily loaded bundled family before its first
 * use, or an upload whose bytes went missing.
 */
export function getWeightAxis(family: string): WeightAxis | undefined {
  return weightAxes.get(family);
}

// --- Subscribing to the registry -------------------------------------------
//
// Registration is asynchronous and happens outside React, but the Style panel
// has to notice it: the weight control can only appear once the face it
// describes has been read. So the registry is a small external store rather
// than something a component has to be told about.

let version = 0;
const listeners = new Set<() => void>();

/** A value that changes whenever a family is registered. */
export function getFontRegistryVersion(): number {
  return version;
}

/** Subscribe to registrations; returns the unsubscribe. */
export function subscribeToFontRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyRegistered(): void {
  version++;
  for (const listener of listeners) listener();
}

/**
 * Register font data as a {@link FontFace} under `family` and make it available
 * to the document. Shared by fresh uploads and by ProjectStore restore, so the
 * exact same family name round-trips across a page reload.
 *
 * A variable font is registered with its **real weight range** as a descriptor.
 * Without one the browser would treat the face as a lone 400 and synthesise
 * every other weight, so a request for 600 would draw smeared fake bold instead
 * of the SemiBold sitting in the file — wrong, and silent about it.
 */
export async function registerFont(
  family: string,
  data: ArrayBuffer | Blob,
): Promise<void> {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
  const axis = readWeightAxis(buffer);

  const face =
    axis && isVariableWeight(axis)
      ? new FontFace(family, buffer, { weight: `${axis.min} ${axis.max}` })
      : new FontFace(family, buffer);
  await face.load();
  document.fonts.add(face);

  // Recorded only after `load()` succeeds, so a family the draw path can't
  // actually use never advertises a weight control.
  weightAxes.set(family, axis ?? staticWeight());
  notifyRegistered();
}

/**
 * Load an uploaded font file as a registered {@link FontFace} and return its
 * unique family name.
 *
 * Loading the user's own font (rather than relying on installed fonts) makes
 * output deterministic across machines (user story 3). Each upload gets a fresh
 * family name so re-uploading a different file never hits a stale cache — and,
 * since the name is minted rather than read off the file, an upload can never
 * collide with another upload or with a bundled family.
 */
export async function loadFontFromFile(file: File): Promise<string> {
  const family = `UITBFont-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await registerFont(family, file);
  return family;
}

/**
 * In-flight or completed loads, one per bundled family.
 *
 * One memo per family rather than the single module-level promise a one-font
 * tool needed: repeated mounts reuse one load and never add duplicate
 * FontFaces, while the four lazy families stay independent of each other. A
 * failed load is evicted rather than cached, so a real browser can retry what
 * failed under jsdom (no `fetch`/`FontFace`) or on a flaky network.
 */
const bundledLoads = new Map<string, Promise<void>>();

/**
 * Fetch and register a bundled family from `public/fonts/`, at most once.
 *
 * Rejects for a family that isn't bundled — callers reach uploaded families
 * through {@link registerFont} instead, whose bytes come from IndexedDB or a
 * project ZIP rather than a URL.
 */
export function loadBundledFont(family: string): Promise<void> {
  const cached = bundledLoads.get(family);
  if (cached) return cached;

  const font = getBundledFont(family);
  if (!font) {
    return Promise.reject(new Error(`Not a bundled font family: ${family}`));
  }

  const load = (async () => {
    const res = await fetch(bundledFontUrl(font));
    if (!res.ok) {
      throw new Error(`Failed to fetch ${font.file}: ${res.status}`);
    }
    await registerFont(family, await res.arrayBuffer());
  })().catch((err) => {
    bundledLoads.delete(family);
    throw err;
  });

  bundledLoads.set(family, load);
  return load;
}

/**
 * Load the bundled default font, so the editor renders Glyphs with no upload
 * and generation has a font on the {@link document.fonts} set (#13).
 *
 * The one family loaded eagerly: a fresh project names it and nothing else, so
 * fetching the rest on mount would spend requests to make nothing render. Its
 * failure stays fatal and reported, where a lazy family's degrades quietly to
 * the canvas fallback (#76).
 */
export function loadDefaultFont(): Promise<void> {
  return loadBundledFont(DEFAULT_FONT_FAMILY);
}

/**
 * Ensure every family in `families` is registered, resolving once they all are.
 *
 * **Generation must await this.** `drawLabel` interpolates the family into
 * `ctx.font` and canvas falls back to its default face *silently* when the face
 * isn't registered yet, so an atlas exported right after picking a lazily
 * loaded family would ship in the wrong font with nothing reporting it. A
 * preview-only await doesn't cover it, since export doesn't go through the
 * preview.
 *
 * Uploaded families are already registered by the upload or the restore that
 * introduced them; only bundled ones can still need fetching, and a family that
 * is neither is left to the caller's repair path rather than failing the whole
 * export.
 *
 * Returns how many families it had to load, so a caller can tell "everything
 * was already here" from "something arrived" without diffing the registry.
 */
export async function ensureFamiliesRegistered(
  families: Iterable<string>,
): Promise<number> {
  const missing = [...new Set(families)].filter(
    (family) =>
      weightAxes.get(family) === undefined &&
      getBundledFont(family) !== undefined,
  );
  await Promise.all(missing.map((family) => loadBundledFont(family)));
  return missing.length;
}

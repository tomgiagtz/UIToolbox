import { DEFAULT_FONT_FAMILY } from "@/lib/glyph/presets";

/** Public URL of the bundled default font (Inter, SIL OFL 1.1). See #13. */
export const DEFAULT_FONT_URL = "/fonts/Inter-Regular.woff2";

/**
 * Register font data as a {@link FontFace} under `family` and make it available
 * to the document. Shared by fresh uploads and by ProjectStore restore, so the
 * exact same family name round-trips across a page reload.
 */
export async function registerFont(
  family: string,
  data: ArrayBuffer | Blob,
): Promise<void> {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
  const face = new FontFace(family, buffer);
  await face.load();
  document.fonts.add(face);
}

/**
 * Load an uploaded font file as a registered {@link FontFace} and return its
 * unique family name.
 *
 * Loading the user's own font (rather than relying on installed fonts) makes
 * output deterministic across machines (user story 3). Each upload gets a fresh
 * family name so re-uploading a different file never hits a stale cache.
 */
export async function loadFontFromFile(file: File): Promise<string> {
  const family = `UITBFont-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await registerFont(family, file);
  return family;
}

let defaultFontLoad: Promise<void> | null = null;

/**
 * Fetch and register the bundled default font (Inter) under
 * {@link DEFAULT_FONT_FAMILY}, so the editor renders Glyphs with no upload and
 * generation has a font on the {@link document.fonts} set (#13). Cached so
 * repeated mounts reuse one load and never add duplicate FontFaces; a failed
 * load (e.g. no `fetch`/`FontFace` under jsdom) is not cached, so a real browser
 * can retry.
 */
export function loadDefaultFont(): Promise<void> {
  defaultFontLoad ??= (async () => {
    const res = await fetch(DEFAULT_FONT_URL);
    if (!res.ok) throw new Error(`Failed to fetch default font: ${res.status}`);
    await registerFont(DEFAULT_FONT_FAMILY, await res.arrayBuffer());
  })().catch((err) => {
    defaultFontLoad = null;
    throw err;
  });
  return defaultFontLoad;
}

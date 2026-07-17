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

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
  const data = await file.arrayBuffer();
  const face = new FontFace(family, data);
  await face.load();
  document.fonts.add(face);
  return family;
}

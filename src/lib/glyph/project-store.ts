/**
 * ProjectStore — client-side persistence for the Input Glyph Creator (#7).
 *
 * The developer's work survives a refresh without re-uploading their font:
 *
 * - The {@link Project} config (colors, Background, Device/Input selection,
 *   naming + filename templates, cell size) is serialized to `localStorage`.
 * - Uploaded font blobs — too large and binary for `localStorage` — live in
 *   IndexedDB keyed by family, and are re-registered as {@link FontFace}s on
 *   restore under the same family names the config already carries.
 *
 * Everything is client-side; nothing here makes a network call. All storage
 * access is defensively guarded so a private-mode / quota / SSR failure degrades
 * to "start fresh" rather than throwing.
 */
import { DEFAULT_FONT_FAMILY } from "@/lib/glyph/defaults";
import { isKnownFamily } from "@/lib/glyph/fonts";
import { clearOverrideField } from "@/lib/glyph/style";
import type {
  Foreground,
  GlyphStyle,
  StyleOverride,
  SymbolPaints,
} from "@/lib/glyph/style";
import type {
  Background,
  BackgroundShape,
  BackgroundSource,
  CustomInput,
  DeviceConfig,
  ExportSettings,
  FontAsset,
  ImageAsset,
  NamingConfig,
  Project,
  LayerTransform,
} from "@/lib/glyph/types";

const CONFIG_KEY = "uitoolbox.glyph-creator.project";

// --- Config format ---------------------------------------------------------
//
// A persisted config is a bare {@link Project}, validated against the *current*
// shape only — there is no version stamp and no migration chain (ADR-0010). The
// same format is shared by localStorage (below) and file export/import (Save/Load
// buttons), so a downloaded JSON file and a localStorage entry are byte-for-byte
// the same and interchangeable.

/** Serialize a project into the pretty-printed config JSON. */
export function serializeConfig(project: Project): string {
  return JSON.stringify(project, null, 2);
}

/**
 * Parse config JSON back into a {@link Project}, or `null` if it is unreadable or
 * doesn't structurally match the current shape. Untrusted input (old builds,
 * hand-edited storage, or an arbitrary uploaded file) is rejected rather than
 * trusted.
 */
export function parseConfig(raw: string): Project | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isProject(parsed) ? repairFontFamilies(parsed) : null;
}

/**
 * Repair the one thing a valid config can still get wrong: a font family the
 * project can't draw in — empty, or naming neither a bundled family nor one of
 * its own uploads.
 *
 * An unusable family flows unresolved into the canvas font string, where it
 * yields a declaration the browser silently answers with its default face. So
 * it is rewritten here, at the single entry point, and the next save persists
 * the repair (ADR-0010 — this holds for *any* config, not for configs of a
 * vintage, which is what would make it a migration).
 *
 * The Project tier takes the bundled default, having no tier above to fall to;
 * a Device or Glyph override instead has the field **deleted**, so it falls up
 * the cascade the way an unset property always does.
 *
 * This is repair, not recovery: it cannot offer the missing font back. Being
 * asked to re-upload, bound to the family the overrides already name, is the
 * blocking missing-assets modal (#81).
 */
function repairFontFamilies(project: Project): Project {
  const known = (family: string) => isKnownFamily(project, family);

  const style = known(project.style.foreground.fontFamily)
    ? project.style
    : {
        ...project.style,
        foreground: {
          ...project.style.foreground,
          fontFamily: DEFAULT_FONT_FAMILY,
        },
      };

  const devices = project.devices.map((device) => ({
    ...device,
    style: repairOverride(device.style, known),
    glyphStyles: Object.fromEntries(
      Object.entries(device.glyphStyles).map(([id, override]) => [
        id,
        repairOverride(override, known),
      ]),
    ),
  }));

  return { ...project, style, devices };
}

/** Drop an override's `fontFamily` when it names a family nothing can draw. */
function repairOverride(
  override: StyleOverride,
  known: (family: string) => boolean,
): StyleOverride {
  const family = override.foreground?.fontFamily;
  if (family === undefined || known(family)) return override;
  return clearOverrideField(override, "font");
}

// --- Config (localStorage) -------------------------------------------------

/** Persist the project config. Silently no-ops if storage is unavailable. */
export function saveConfig(project: Project): void {
  try {
    localStorage.setItem(CONFIG_KEY, serializeConfig(project));
  } catch {
    // localStorage can be absent (SSR) or throw (private mode / quota). The
    // developer just loses persistence for this change, not the session.
  }
}

/**
 * The outcome of a config load. `empty` and `rejected` both mean "fall back to a
 * default project", but only `rejected` means the user *lost* something — the
 * caller tells them so (ADR-0010).
 */
export type LoadResult =
  { kind: "empty" } | { kind: "rejected" } | { kind: "ok"; project: Project };

/**
 * Load the persisted project config. A stored payload that no longer parses is
 * discarded — the key is removed, so the caller's message fires once rather than
 * on every reload until an edit happens to overwrite it.
 */
export function loadConfig(): LoadResult {
  let raw: string | null;
  try {
    raw = localStorage.getItem(CONFIG_KEY);
  } catch {
    return { kind: "empty" };
  }
  if (raw === null) return { kind: "empty" };

  const project = parseConfig(raw);
  if (project) return { kind: "ok", project };

  try {
    localStorage.removeItem(CONFIG_KEY);
  } catch {
    // Nothing to do — the message is still correct, it just repeats next load.
  }
  return { kind: "rejected" };
}

// --- Font blobs (IndexedDB) ------------------------------------------------

const DB_NAME = "uitoolbox";
/**
 * v2 added the `images` store for custom image Render Sources (ADR-0008).
 *
 * Going multi-slot on fonts needed **no bump and no migration** (ADR-0012 §7):
 * the stored record `{ family, fileName, blob }` already *is* the multi-slot
 * record — the key was never load-bearing, since the record has always carried
 * its own `family` — so `getAll()` over an untouched v2 database returns a
 * well-formed set. This is ADR-0010's posture paying off: the old shape is the
 * current shape.
 */
const DB_VERSION = 2;
const FONT_STORE = "fonts";
const IMAGE_STORE = "images";

/** A persisted font: its registered family, original file name, and raw blob. */
export interface PersistedFont extends FontAsset {
  blob: Blob;
}

/**
 * A persisted custom image: its {@link ImageAsset} manifest fields plus the raw
 * blob. Unlike the font there can be many, so each is keyed by its image id.
 */
export interface PersistedImage extends ImageAsset {
  blob: Blob;
}

/**
 * Persist one uploaded font, keyed by its family. Silently no-ops if IndexedDB
 * is unavailable.
 */
export async function saveFont(font: PersistedFont): Promise<void> {
  try {
    const db = await openDb();
    await runRequest(txStore(db, "readwrite").put(font, font.family));
    db.close();
  } catch {
    // No IndexedDB (SSR / disabled) — the font simply won't be restored.
  }
}

/**
 * Every persisted font, or an empty list if none or IndexedDB is unavailable.
 * The caller re-registers each via {@link registerFont}.
 */
export async function loadFonts(): Promise<PersistedFont[]> {
  try {
    const db = await openDb();
    const fonts = await runRequest<PersistedFont[]>(
      txStore(db, "readonly").getAll(),
    );
    db.close();
    return fonts ?? [];
  } catch {
    return [];
  }
}

/**
 * Replace every persisted font with `fonts` — what loading a project file does,
 * since the incoming project owns the whole set.
 *
 * Unlike {@link replaceImages} this isn't about key collisions (a minted family
 * can't collide); it is about growth. Merging would accumulate the blobs of
 * every project ever opened in this browser, none of them reachable once their
 * manifest was replaced.
 */
export async function replaceFonts(fonts: PersistedFont[]): Promise<void> {
  try {
    const db = await openDb();
    // One transaction, so a failure part-way can't leave a half-swapped store.
    const store = txStore(db, "readwrite");
    await Promise.all([
      runRequest(store.clear()),
      ...fonts.map((font) => runRequest(store.put(font, font.family))),
    ]);
    db.close();
  } catch {
    // No IndexedDB (SSR / disabled) — the fonts just won't survive a reload.
  }
}

// --- Custom images (IndexedDB) ---------------------------------------------
//
// Custom image Render Sources persist beside the font so an upload survives a
// refresh (ADR-0008, amending ADR-0004). Missing bytes are never fatal: a Glyph
// referencing an image that didn't come back falls through to its Symbol or label.

/** Persist one uploaded image. Silently no-ops if IndexedDB is unavailable. */
export async function saveImage(image: PersistedImage): Promise<void> {
  try {
    const db = await openDb();
    await runRequest(
      txStore(db, "readwrite", IMAGE_STORE).put(image, image.id),
    );
    db.close();
  } catch {
    // No IndexedDB (SSR / disabled) — the image just won't survive a reload.
  }
}

/** Every persisted image, or an empty list if none or IndexedDB is unavailable. */
export async function loadImages(): Promise<PersistedImage[]> {
  try {
    const db = await openDb();
    const images = await runRequest<PersistedImage[]>(
      txStore(db, "readonly", IMAGE_STORE).getAll(),
    );
    db.close();
    return images ?? [];
  } catch {
    return [];
  }
}

/**
 * Replace every persisted image with `images` — what loading a project file does,
 * since the incoming project owns the whole set.
 *
 * Merging would be wrong rather than merely untidy: image ids are allocated per
 * project (`img-1.png`, `img-2.png`…), so two projects routinely use the same id
 * for different art. Left in place, the outgoing project's bytes would answer the
 * incoming one's id.
 */
export async function replaceImages(images: PersistedImage[]): Promise<void> {
  try {
    const db = await openDb();
    // One transaction, so a failure part-way can't leave a half-swapped store.
    const store = txStore(db, "readwrite", IMAGE_STORE);
    await Promise.all([
      runRequest(store.clear()),
      ...images.map((image) => runRequest(store.put(image, image.id))),
    ]);
    db.close();
  } catch {
    // No IndexedDB (SSR / disabled) — the images just won't survive a reload.
  }
}

/**
 * Delete the persisted bytes for `ids`, as removing an image does (ADR-0014 §6).
 *
 * Plural, and one transaction, because the sweep removes a whole set at once and
 * a half-applied sweep would leave bytes with no manifest row to find them by.
 * Silently no-ops without IndexedDB, like every write here: the manifest row is
 * already gone, so the worst case is orphaned bytes that the next project load
 * clears wholesale (ADR-0011).
 */
export async function deleteImages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const db = await openDb();
    const store = txStore(db, "readwrite", IMAGE_STORE);
    await Promise.all(ids.map((id) => runRequest(store.delete(id))));
    db.close();
  } catch {
    // No IndexedDB (SSR / disabled) — nothing was persisted to delete.
  }
}

/** Clear all persisted state (config + fonts + images). */
export async function clear(): Promise<void> {
  try {
    localStorage.removeItem(CONFIG_KEY);
  } catch {
    // ignore
  }
  try {
    const db = await openDb();
    // Clearing the whole store rather than deleting keys also sweeps the one
    // orphan a pre-multi-slot user is left with at the old `"current"` key.
    await runRequest(txStore(db, "readwrite").clear());
    await runRequest(txStore(db, "readwrite", IMAGE_STORE).clear());
    db.close();
  } catch {
    // ignore
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      // Runs for a fresh DB and for a v1 → v2 upgrade alike, so each store is
      // created only if it isn't already there.
      const db = req.result;
      for (const name of [FONT_STORE, IMAGE_STORE]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txStore(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  store: string = FONT_STORE,
): IDBObjectStore {
  return db.transaction(store, mode).objectStore(store);
}

function runRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// --- Validation ------------------------------------------------------------
//
// Persisted config is untrusted input (old builds, hand-edited storage). Reject
// anything that doesn't structurally match the current Project so a bad payload
// falls back to defaults instead of corrupting the editor.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The shape vocabulary a Background may use — "none" is a source, not a shape.
 * Typed as the union rather than `string[]` so the two can't drift apart.
 */
const SHAPES: readonly BackgroundShape[] = ["rounded-rect", "square", "circle"];

function isBackgroundSource(value: unknown): value is BackgroundSource {
  if (!isRecord(value)) return false;
  if (value.kind === "shape" || value.kind === "none") return true;
  if (value.kind === "authored") return typeof value.backgroundId === "string";
  return value.kind === "image" && typeof value.imageId === "string";
}

/**
 * A resolved {@link LayerTransform} is **total** — a persisted one with a
 * component missing is not a transform that falls up, it's a broken file. Finite,
 * too: `NaN` survives `typeof x === "number"` and, while the canvas ignores a
 * non-finite matrix rather than breaking on it, ADR-0010 would rather discard the
 * file than silently draw something the numbers don't describe.
 */
function isLayerTransform(value: unknown): value is LayerTransform {
  return (
    isRecord(value) &&
    isFiniteNumber(value.rotation) &&
    isRecord(value.scale) &&
    isFiniteNumber(value.scale.x) &&
    isFiniteNumber(value.scale.y)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBackground(value: unknown): value is Background {
  if (!isRecord(value)) return false;
  return (
    SHAPES.includes(value.shape as BackgroundShape) &&
    isLayerTransform(value.transform) &&
    typeof value.fill === "string" &&
    typeof value.cornerRadius === "number" &&
    isRecord(value.border) &&
    typeof value.border.width === "number" &&
    typeof value.border.color === "string" &&
    isBackgroundSource(value.source)
  );
}

function isSymbolPaints(value: unknown): value is SymbolPaints {
  return (
    isRecord(value) &&
    typeof value.fill === "string" &&
    typeof value.border === "string" &&
    typeof value.secondary === "string"
  );
}

/**
 * The Project tier of the cascade — a **full** {@link GlyphStyle}, unlike the
 * sparse Device/Glyph overrides, so every field is required. One guard serves
 * both the persisted config and (once presets land) a Preset's payload, so the
 * two shapes cannot drift apart (ADR-0012 §6).
 */
function isGlyphStyle(value: unknown): value is GlyphStyle {
  return (
    isRecord(value) &&
    isBackground(value.background) &&
    isForeground(value.foreground)
  );
}

/**
 * The foreground layer of a resolved style — total, like its Background twin.
 *
 * `fontFamily` is checked for its type only: an empty or unknown family is a
 * valid (if undrawable) string, repaired by {@link repairFontFamilies} rather
 * than rejected, since discarding a whole project over one font would lose far
 * more than it protects.
 */
function isForeground(value: unknown): value is Foreground {
  return (
    isRecord(value) &&
    isLayerTransform(value.transform) &&
    typeof value.fontFamily === "string" &&
    isFiniteNumber(value.fontWeight) &&
    typeof value.textColor === "string" &&
    isSymbolPaints(value.symbolPaints)
  );
}

function isNaming(value: unknown): value is NamingConfig {
  return (
    isRecord(value) &&
    typeof value.template === "string" &&
    typeof value.filenameTemplate === "string" &&
    ["snake", "kebab", "camel"].includes(value.case as string)
  );
}

function isExportSettings(value: unknown): value is ExportSettings {
  return (
    isRecord(value) &&
    typeof value.cellSize === "number" &&
    isNaming(value.naming)
  );
}

function isCustomInput(value: unknown): value is CustomInput {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string"
  );
}

function isDevice(value: unknown): value is DeviceConfig {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.catalogId === "string" &&
    Array.isArray(value.enabled) &&
    value.enabled.every((id) => typeof id === "string") &&
    Array.isArray(value.custom) &&
    value.custom.every(isCustomInput) &&
    // Style Cascade overrides are sparse objects; validated by shape, not content.
    isRecord(value.style) &&
    isRecord(value.glyphStyles)
  );
}

function isFontAsset(value: unknown): value is FontAsset {
  return (
    isRecord(value) &&
    typeof value.family === "string" &&
    typeof value.fileName === "string"
  );
}

function isImageAsset(value: unknown): value is ImageAsset {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.fileName === "string" &&
    typeof value.type === "string"
  );
}

/**
 * One flat structural check over the current {@link Project}.
 *
 * A config from before the font joined the cascade carried `font: { family }`
 * and no `fonts`, so it fails here and is discarded with the loss reported —
 * ADR-0010's correctness rule, deliberately not a data-preservation one.
 */
function isProject(value: unknown): value is Project {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    isGlyphStyle(value.style) &&
    Array.isArray(value.fonts) &&
    value.fonts.every(isFontAsset) &&
    Array.isArray(value.images) &&
    value.images.every(isImageAsset) &&
    Array.isArray(value.devices) &&
    value.devices.every(isDevice) &&
    isExportSettings(value.exportSettings)
  );
}

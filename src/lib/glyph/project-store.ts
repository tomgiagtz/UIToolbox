/**
 * ProjectStore — client-side persistence for the Input Glyph Creator (#7).
 *
 * The developer's work survives a refresh without re-uploading their font:
 *
 * - The {@link Project} config (colors, Background, Device/Input selection,
 *   naming + filename templates, cell size) is serialized to `localStorage`.
 * - The uploaded font blob — too large and binary for `localStorage` — lives in
 *   IndexedDB, and is re-registered as a {@link FontFace} on restore under the
 *   same family name the config already carries.
 *
 * Everything is client-side; nothing here makes a network call. All storage
 * access is defensively guarded so a private-mode / quota / SSR failure degrades
 * to "start fresh" rather than throwing.
 */
import { DEFAULT_FONT_FAMILY } from "@/lib/glyph/defaults";
import type { GlyphStyle, SymbolPaints } from "@/lib/glyph/style";
import type {
  Background,
  BackgroundShape,
  BackgroundSource,
  CustomInput,
  DeviceConfig,
  ExportSettings,
  ImageAsset,
  NamingConfig,
  Project,
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
  return isProject(parsed) ? repairFontFamily(parsed) : null;
}

/**
 * Repair the one thing a valid config can still get wrong: an empty font family.
 * `family` flows unresolved into the canvas font string, where `""` yields an
 * invalid declaration and silently draws in the browser default — so it is
 * rewritten to the bundled default here, at the single entry point, and the next
 * save persists the real name (ADR-0010).
 */
function repairFontFamily(project: Project): Project {
  if (project.font.family !== "") return project;
  return { ...project, font: { ...project.font, family: DEFAULT_FONT_FAMILY } };
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

// --- Font blob (IndexedDB) -------------------------------------------------

const DB_NAME = "uitoolbox";
/** v2 added the `images` store for custom image Render Sources (ADR-0008). */
const DB_VERSION = 2;
const FONT_STORE = "fonts";
const IMAGE_STORE = "images";
/** Single-slot key: the creator tracks exactly one active font at a time. */
const FONT_KEY = "current";

/** A persisted font: its registered family, original file name, and raw blob. */
export interface PersistedFont {
  family: string;
  fileName: string;
  blob: Blob;
}

/**
 * A persisted custom image: its {@link ImageAsset} manifest fields plus the raw
 * blob. Unlike the font there can be many, so each is keyed by its image id.
 */
export interface PersistedImage extends ImageAsset {
  blob: Blob;
}

/** Persist the uploaded font blob. Silently no-ops if IndexedDB is unavailable. */
export async function saveFont(font: PersistedFont): Promise<void> {
  try {
    const db = await openDb();
    await runRequest(txStore(db, "readwrite").put(font, FONT_KEY));
    db.close();
  } catch {
    // No IndexedDB (SSR / disabled) — the font simply won't be restored.
  }
}

/**
 * Load the persisted font, or `null` if none is stored or IndexedDB is
 * unavailable. The caller re-registers it via {@link registerFont}.
 */
export async function loadFont(): Promise<PersistedFont | null> {
  try {
    const db = await openDb();
    const font = await runRequest<PersistedFont | undefined>(
      txStore(db, "readonly").get(FONT_KEY),
    );
    db.close();
    return font ?? null;
  } catch {
    return null;
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

/** Clear all persisted state (config + font + images). */
export async function clear(): Promise<void> {
  try {
    localStorage.removeItem(CONFIG_KEY);
  } catch {
    // ignore
  }
  try {
    const db = await openDb();
    await runRequest(txStore(db, "readwrite").delete(FONT_KEY));
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

function isBackground(value: unknown): value is Background {
  if (!isRecord(value)) return false;
  return (
    SHAPES.includes(value.shape as BackgroundShape) &&
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
    typeof value.textColor === "string" &&
    isBackground(value.background) &&
    isSymbolPaints(value.symbolPaints) &&
    typeof value.contentScale === "number"
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

function isImageAsset(value: unknown): value is ImageAsset {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.fileName === "string" &&
    typeof value.type === "string"
  );
}

/**
 * One flat structural check over the current {@link Project}. `font.family` is
 * only checked for its type — `""` is a valid (if unhelpful) family, repaired by
 * {@link normalize} rather than rejected.
 */
function isProject(value: unknown): value is Project {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    isRecord(value.font) &&
    typeof value.font.family === "string" &&
    isGlyphStyle(value.style) &&
    Array.isArray(value.images) &&
    value.images.every(isImageAsset) &&
    Array.isArray(value.devices) &&
    value.devices.every(isDevice) &&
    isExportSettings(value.exportSettings)
  );
}

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
import { getCatalogByName } from "@/lib/glyph/catalog";
import type {
  Background,
  CustomInput,
  DeviceConfig,
  NamingConfig,
  Project,
} from "@/lib/glyph/types";

const CONFIG_KEY = "uitoolbox.glyph-creator.project";
/**
 * Bump when the persisted config shape changes incompatibly.
 * - v1: Devices were `{ name, inputs: string[] }`.
 * - v2: Devices are `{ name, catalogId, enabled, custom, style, glyphStyles }`
 *   (the Catalog + Style Cascade model, #15). v1 saves are migrated on load.
 */
const CONFIG_VERSION = 2;

interface PersistedConfig {
  version: number;
  project: unknown;
}

// --- Config format ---------------------------------------------------------
//
// One versioned envelope is the single source of truth for the persisted shape,
// shared by localStorage (below) and file export/import (Save/Load buttons), so
// a downloaded JSON file and a localStorage entry are byte-for-byte the same
// format and interchangeable.

/** Serialize a project into the versioned, pretty-printed config JSON. */
export function serializeConfig(project: Project): string {
  const payload: PersistedConfig = { version: CONFIG_VERSION, project };
  return JSON.stringify(payload, null, 2);
}

/**
 * Parse config JSON back into a {@link Project}, or `null` if it is unreadable,
 * structurally invalid, or of an unknown schema version. Older but recognized
 * versions are migrated forward (see {@link migrateConfig}) so existing saves
 * still load. Untrusted input (old builds, hand-edited storage, or an arbitrary
 * uploaded file) is rejected rather than trusted.
 */
export function parseConfig(raw: string): Project | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isPersistedConfig(parsed)) return null;
  return migrateConfig(parsed.version, parsed.project);
}

/**
 * Bring a persisted payload up to the current {@link Project} shape, or return
 * `null` for an unknown version or a payload that doesn't match the shape it
 * claims.
 */
function migrateConfig(version: number, project: unknown): Project | null {
  if (version === CONFIG_VERSION) {
    return isProject(project) ? project : null;
  }
  if (version === 1) {
    return isProjectV1(project) ? migrateV1(project) : null;
  }
  return null;
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
 * Load the persisted project config, or `null` if there is none, the payload is
 * unreadable, or its schema version is unknown. A `null` return means the caller
 * should fall back to a default project.
 */
export function loadConfig(): Project | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(CONFIG_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  return parseConfig(raw);
}

// --- Font blob (IndexedDB) -------------------------------------------------

const DB_NAME = "uitoolbox";
const DB_VERSION = 1;
const FONT_STORE = "fonts";
/** Single-slot key: the creator tracks exactly one active font at a time. */
const FONT_KEY = "current";

/** A persisted font: its registered family, original file name, and raw blob. */
export interface PersistedFont {
  family: string;
  fileName: string;
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

/** Clear all persisted state (config + font). */
export async function clear(): Promise<void> {
  try {
    localStorage.removeItem(CONFIG_KEY);
  } catch {
    // ignore
  }
  try {
    const db = await openDb();
    await runRequest(txStore(db, "readwrite").delete(FONT_KEY));
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
      req.result.createObjectStore(FONT_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txStore(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(FONT_STORE, mode).objectStore(FONT_STORE);
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

function isPersistedConfig(value: unknown): value is PersistedConfig {
  return isRecord(value) && typeof value.version === "number" && "project" in value;
}

function isBackground(value: unknown): value is Background {
  if (!isRecord(value)) return false;
  const shapes = ["rounded-rect", "square", "circle", "none"];
  return (
    shapes.includes(value.shape as string) &&
    typeof value.fill === "string" &&
    typeof value.cornerRadius === "number" &&
    isRecord(value.border) &&
    typeof value.border.width === "number" &&
    typeof value.border.color === "string"
  );
}

function isNaming(value: unknown): value is NamingConfig {
  return (
    isRecord(value) &&
    typeof value.template === "string" &&
    ["snake", "kebab", "camel"].includes(value.case as string)
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

/**
 * The Project shape shared by v1 and v2 (everything except the Devices). Split
 * out so both the current validator and the v1 migrator check the common fields.
 */
function hasProjectCommonFields(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    isRecord(value.font) &&
    typeof value.font.family === "string" &&
    typeof value.textColor === "string" &&
    isBackground(value.background) &&
    typeof value.cellSize === "number" &&
    Array.isArray(value.devices) &&
    isNaming(value.naming) &&
    typeof value.filenameTemplate === "string"
  );
}

function isProject(value: unknown): value is Project {
  return (
    hasProjectCommonFields(value) &&
    (value.devices as unknown[]).every(isDevice)
  );
}

// --- v1 → v2 migration -----------------------------------------------------
//
// v1 Devices were a flat list of Input label strings. v2 splits them into a
// Catalog-referenced enabled selection plus custom Inputs. Labels that match a
// Catalog entry are enabled (preserving encounter order); the rest become custom
// Inputs — so a v1 save still loads and generates the same Inputs.

/** A v1 Device: `{ name, inputs: string[] }`. */
interface DeviceV1 {
  name: string;
  inputs: string[];
}

function isDeviceV1(value: unknown): value is DeviceV1 {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    Array.isArray(value.inputs) &&
    value.inputs.every((i) => typeof i === "string")
  );
}

function isProjectV1(value: unknown): value is Project & { devices: DeviceV1[] } {
  return (
    hasProjectCommonFields(value) &&
    (value.devices as unknown[]).every(isDeviceV1)
  );
}

function migrateV1(project: Project & { devices: DeviceV1[] }): Project {
  return { ...project, devices: project.devices.map(migrateV1Device) };
}

function migrateV1Device(device: DeviceV1): DeviceConfig {
  const catalog = getCatalogByName(device.name);
  const byLabel = new Map(
    catalog?.inputs.map((i) => [i.label, i.id] as const) ?? [],
  );

  const enabled: string[] = [];
  const custom: CustomInput[] = [];
  let customCount = 0;

  for (const label of device.inputs) {
    const id = byLabel.get(label);
    if (id !== undefined && !enabled.includes(id)) {
      enabled.push(id);
    } else {
      custom.push({ id: `custom-${++customCount}`, label });
    }
  }

  return {
    name: device.name,
    catalogId: catalog?.id ?? "",
    enabled,
    custom,
    style: {},
    glyphStyles: {},
  };
}

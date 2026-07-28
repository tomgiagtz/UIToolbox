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
import { catalogNameIndex, getCatalogByName } from "@/lib/glyph/catalog";
import {
  DEFAULT_BACKGROUND,
  DEFAULT_CONTENT_SCALE,
  DEFAULT_SYMBOL_PAINTS,
} from "@/lib/glyph/presets";
import type {
  BackgroundOverride,
  StyleOverride,
  SymbolPaints,
} from "@/lib/glyph/style";
import type {
  Background,
  BackgroundShape,
  BackgroundSource,
  CustomInput,
  DeviceConfig,
  ImageAsset,
  NamingConfig,
  Project,
} from "@/lib/glyph/types";

const CONFIG_KEY = "uitoolbox.glyph-creator.project";
/**
 * Bump when the persisted config shape changes incompatibly.
 * - v1: Devices were `{ name, inputs: string[] }`.
 * - v2: Devices are `{ name, catalogId, enabled, custom, style, glyphStyles }`
 *   (the Catalog + Style Cascade model, #15). v1 saves are migrated on load.
 * - v3: Project gains the `symbolPaints` base tier (ADR-0007 §3). v1/v2 saves are
 *   migrated forward by backfilling the default Symbol Paint Role colours.
 * - v4: Project gains `contentScale` (the cascade's base Render Source scale) and
 *   the `images` manifest for custom image Render Sources (issue #20). Older saves
 *   backfill the unscaled default and an empty manifest.
 * - v5: the Background's tile art becomes a `source` union — shape / authored /
 *   uploaded image / none (issue #22) — replacing the `backgroundId` + `flipX`
 *   pair and the `shape: "none"` spelling of "draw nothing". Older saves rewrite
 *   both, at every cascade tier, into the union; a saved id wins over a "none"
 *   shape, because that is what v4 drew.
 */
const CONFIG_VERSION = 5;

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
  // Each older version migrates into the next, so one step is written per bump.
  if (version === 4) {
    return isProjectV4(project) ? migrateV4(project) : null;
  }
  if (version === 3) {
    return isProjectV3(project) ? migrateV4(migrateV3(project)) : null;
  }
  if (version === 2) {
    return isProjectV2(project)
      ? migrateV4(migrateV3(migrateV2(project)))
      : null;
  }
  if (version === 1) {
    return isProjectV1(project)
      ? migrateV4(migrateV3(migrateV2(migrateV1(project))))
      : null;
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

function isPersistedConfig(value: unknown): value is PersistedConfig {
  return (
    isRecord(value) && typeof value.version === "number" && "project" in value
  );
}

/** The shape vocabulary a v5 Background may use. */
const SHAPES: readonly string[] = ["rounded-rect", "square", "circle"];
/**
 * v4-and-older saves spell "draw nothing" as a fourth shape. v5 moved that into
 * the `source` union, so the legacy validators must still accept it and the
 * current-version one must not.
 */
const LEGACY_SHAPES: readonly string[] = [...SHAPES, "none"];

/**
 * The Background fields every version has carried. Split from the `source` union
 * (v5) so the v4-and-older validators can share it — those saves have everything
 * here and nothing there — and parameterized on `shapes` because the two paths
 * no longer agree on what a shape is.
 */
function isBackgroundCore(
  value: unknown,
  shapes: readonly string[],
): value is LegacyBackground {
  if (!isRecord(value)) return false;
  return (
    shapes.includes(value.shape as string) &&
    typeof value.fill === "string" &&
    typeof value.cornerRadius === "number" &&
    isRecord(value.border) &&
    typeof value.border.width === "number" &&
    typeof value.border.color === "string"
  );
}

function isBackgroundSource(value: unknown): value is BackgroundSource {
  if (!isRecord(value)) return false;
  if (value.kind === "shape" || value.kind === "none") return true;
  if (value.kind === "authored") return typeof value.backgroundId === "string";
  return value.kind === "image" && typeof value.imageId === "string";
}

function isBackground(value: unknown): value is Background {
  return (
    isRecord(value) &&
    isBackgroundCore(value, SHAPES) &&
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
function hasProjectCommonFields(
  value: unknown,
): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    isRecord(value.font) &&
    typeof value.font.family === "string" &&
    typeof value.textColor === "string" &&
    // Only the fields every version shares: v5 adds the `source` union on top,
    // and `isProject` is what insists on it.
    isBackgroundCore(value.background, LEGACY_SHAPES) &&
    typeof value.cellSize === "number" &&
    Array.isArray(value.devices) &&
    isNaming(value.naming) &&
    typeof value.filenameTemplate === "string"
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
 * Both halves are load-bearing. `isProjectV4` accepts the legacy shape
 * vocabulary by design (it validates v4-and-older saves too), so `isBackground`
 * — the current-version check — is the only thing rejecting a v5 payload that
 * still spells "no tile" as `shape: "none"`. Don't collapse this to one call.
 */
function isProject(value: unknown): value is Project {
  return isProjectV4(value) && isBackground(value.background);
}

/**
 * A v4 Project: the current shape with the pre-union Background — an optional
 * Authored Background id + mirror flag instead of the `source` union added in v5.
 * {@link migrateV4} rewrites the pair, at every cascade tier.
 */
type ProjectV4 = Omit<Project, "background"> & { background: LegacyBackground };

function isProjectV4(value: unknown): value is ProjectV4 {
  return (
    isProjectV3(value) &&
    typeof (value as Record<string, unknown>).contentScale === "number" &&
    Array.isArray((value as Record<string, unknown>).images) &&
    ((value as Record<string, unknown>).images as unknown[]).every(isImageAsset)
  );
}

/**
 * A v3 Project: the v4 shape minus the content scale and image manifest
 * (added in v4). {@link migrateV3} backfills both.
 */
type ProjectV3 = Omit<ProjectV4, "contentScale" | "images">;

function isProjectV3(value: unknown): value is ProjectV3 {
  return (
    hasProjectCommonFields(value) &&
    isSymbolPaints(value.symbolPaints) &&
    (value.devices as unknown[]).every(isDevice)
  );
}

function migrateV3(project: ProjectV3): ProjectV4 {
  return {
    ...project,
    contentScale: DEFAULT_CONTENT_SCALE,
    images: [],
  };
}

// --- v4 → v5 migration -----------------------------------------------------
//
// Before v5 a Background named its tile art with an optional `backgroundId` plus
// a `flipX` mirror — and, inside a sparse override, a `null` id meaning "no tile,
// draw the shape". "Draw nothing at all" was a fourth *shape*, `shape: "none"`.
// v5 replaces all of that with one {@link BackgroundSource} union, so both
// spellings have to be rewritten wherever they can appear: the Project base, a
// Device override, or a per-Glyph override.

/** v4's fourth shape, which v5 spells `source: { kind: "none" }`. */
type LegacyShape = BackgroundShape | "none";

/**
 * The pre-v5 Background: the shared fields, the old shape vocabulary, and the
 * tile pair it named art with.
 */
type LegacyBackground = Omit<Background, "source" | "shape"> & {
  shape: LegacyShape;
} & LegacyTile;

/** The pre-v5 tile fields. A `null` id is the override tier's "no tile". */
interface LegacyTile {
  backgroundId?: string | null;
  flipX?: boolean;
  shape?: LegacyShape;
}

/**
 * The {@link BackgroundSource} a pre-v5 Background meant, or `undefined` when it
 * named no tile at all — which at the Project tier means the plain shape, and in
 * a sparse override means "unset, fall up the cascade".
 *
 * The order is what v4 *drew*: `renderGlyph` painted tile art whenever it had a
 * bitmap and never consulted `shape`, so a saved id outranked `shape: "none"`.
 * Reading the shape first would silently blank every saved bumper and trigger
 * whose tier also carried it.
 */
function legacySource(tile: LegacyTile): BackgroundSource | undefined {
  if (typeof tile.backgroundId === "string") {
    return {
      kind: "authored",
      backgroundId: tile.backgroundId,
      ...(tile.flipX ? { flipX: true } : {}),
    };
  }
  if (tile.shape === "none") return { kind: "none" };
  if (tile.backgroundId === null) return { kind: "shape" };
  return undefined;
}

/**
 * A v4 shape in the v5 vocabulary. "none" moved into the `source` union, and the
 * field it vacates takes the default primitive — inert, because the source that
 * replaced it draws nothing that reads `shape`. It surfaces only if the user
 * later picks "Shape", where the tool's default is the right answer.
 */
function currentShape(shape: LegacyShape): BackgroundShape {
  return shape === "none" ? DEFAULT_BACKGROUND.shape : shape;
}

function migrateV4(project: ProjectV4): Project {
  const { backgroundId, flipX, ...background } = project.background;
  return {
    ...project,
    background: {
      ...background,
      shape: currentShape(background.shape),
      source: legacySource({
        backgroundId,
        flipX,
        shape: background.shape,
      }) ?? { kind: "shape" },
    },
    devices: project.devices.map((device) => ({
      ...device,
      style: migrateOverrideV4(device.style),
      glyphStyles: Object.fromEntries(
        Object.entries(device.glyphStyles).map(([id, override]) => [
          id,
          migrateOverrideV4(override),
        ]),
      ),
    })),
  };
}

/** Rewrite one sparse override's pre-v5 tile spellings into a `source`. */
function migrateOverrideV4(override: StyleOverride): StyleOverride {
  const legacy = override.background as
    (Omit<BackgroundOverride, "shape"> & LegacyTile) | undefined;
  if (!legacy) return override;
  // Both tile fields go, even when they don't amount to a source: a `flipX`
  // with no id described a tile this tier never named, and v5 has nowhere to
  // keep it.
  const { backgroundId, flipX, ...background } = legacy;
  const source = legacySource({ backgroundId, flipX, shape: background.shape });
  // "none" is no longer a shape — the source carries it — and the key it vacates
  // is *removed*, never defaulted. Backfilling a real shape would newly pin that
  // property at this tier, so a later Project-level shape change would silently
  // stop reaching this Glyph, and the user would get a reset control for an
  // override they never made.
  if (background.shape === "none") delete background.shape;
  return {
    ...override,
    background: (source
      ? { ...background, source }
      : background) as BackgroundOverride,
  };
}

/**
 * A v2 Project: the v3 shape minus the `symbolPaints` base tier (added in v3).
 * `hasProjectCommonFields` already excludes `symbolPaints`, so this is the v2
 * validator; {@link migrateV2} backfills the default palette.
 */
type ProjectV2 = Omit<ProjectV3, "symbolPaints">;

function isProjectV2(value: unknown): value is ProjectV2 {
  return (
    hasProjectCommonFields(value) &&
    (value.devices as unknown[]).every(isDevice)
  );
}

function migrateV2(project: ProjectV2): ProjectV3 {
  return { ...project, symbolPaints: DEFAULT_SYMBOL_PAINTS };
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

function isProjectV1(
  value: unknown,
): value is ProjectV2 & { devices: DeviceV1[] } {
  return (
    hasProjectCommonFields(value) &&
    (value.devices as unknown[]).every(isDeviceV1)
  );
}

/** v1 → v2: split flat Input label lists into Catalog `enabled` + custom Inputs. */
function migrateV1(project: ProjectV2 & { devices: DeviceV1[] }): ProjectV2 {
  return { ...project, devices: project.devices.map(migrateV1Device) };
}

function migrateV1Device(device: DeviceV1): DeviceConfig {
  const catalog = getCatalogByName(device.name);
  // By every name an Input answers to, not just its label: a v1 save listing
  // "RB" on a PlayStation Device meant R1, and should recover that Catalog Input
  // rather than strand it as a custom one.
  const byLabel = catalog
    ? catalogNameIndex(catalog)
    : new Map<string, string>();

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

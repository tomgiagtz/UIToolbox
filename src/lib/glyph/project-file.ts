/**
 * Project files — the Save/Load format for the Input Glyph Creator.
 *
 * A saved project is either:
 *
 * - a **JSON** file (`{name}.json`) carrying just the config, or
 * - a **ZIP** file (`{name}.zip`) bundling that same `config.json` alongside any
 *   uploaded fonts under `fonts/` and uploaded custom images under `images/`
 *   (unmodified bytes, not base64-blobbed), so a project is portable between
 *   machines without re-uploading its assets. Bundled font families never
 *   travel — the tool on the other end already has them.
 *
 * The config inside both is the exact format ProjectStore persists to
 * `localStorage` — a bare {@link Project} (see {@link serializeConfig} /
 * {@link parseConfig}) — so files and browser storage are interchangeable.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { ExportArtifact } from "@/lib/glyph/exporter";
import { safeBaseName } from "@/lib/glyph/naming";
import {
  parseConfig,
  serializeConfig,
  type PersistedFont,
  type PersistedImage,
} from "@/lib/glyph/project-store";
import type { Project } from "@/lib/glyph/types";

/** The config's entry name inside a project ZIP. */
const CONFIG_ENTRY = "config.json";
/** Folder every uploaded font's bytes live under, keyed by its file name. */
const FONT_PREFIX = "fonts/";
/** Folder every custom image's bytes live under, keyed by its image id. */
const IMAGE_PREFIX = "images/";

/**
 * A project restored from a file: its config, plus whichever assets the file
 * bundled — the uploaded fonts and custom images (issue #20).
 */
export interface ImportedProject {
  project: Project;
  fonts: PersistedFont[];
  images: PersistedImage[];
}

/**
 * Build a downloadable project file. With any uploaded fonts or custom images,
 * produces a ZIP of `config.json` + those asset files; with neither, a plain
 * config JSON — which is what a project styled entirely in bundled families
 * still saves as.
 *
 * Only the bytes go in the ZIP — an asset's filename and (for an image) MIME
 * type already ride in the config's manifest, so there is one place they can
 * disagree: none. A font's entry name *is* its manifest `fileName`, made unique
 * back at upload, so nothing is renamed here.
 */
export async function exportProjectFile(
  project: Project,
  fonts: PersistedFont[] = [],
  images: PersistedImage[] = [],
): Promise<ExportArtifact> {
  const base = safeBaseName(project.name);
  const configJson = serializeConfig(project);

  if (fonts.length === 0 && images.length === 0) {
    return {
      filename: `${base}.json`,
      blob: new Blob([configJson], { type: "application/json" }),
    };
  }

  const entries: Record<string, Uint8Array> = {
    [CONFIG_ENTRY]: strToU8(configJson),
  };
  for (const font of fonts) {
    entries[`${FONT_PREFIX}${font.fileName}`] = new Uint8Array(
      await font.blob.arrayBuffer(),
    );
  }
  for (const image of images) {
    entries[`${IMAGE_PREFIX}${image.id}`] = new Uint8Array(
      await image.blob.arrayBuffer(),
    );
  }

  const zip = zipSync(entries);
  return {
    filename: `${base}.zip`,
    // Copy into a fresh Uint8Array so the Blob owns a plain ArrayBuffer.
    blob: new Blob([zip.slice()], { type: "application/zip" }),
  };
}

/**
 * The imported project as the editor should *hold* it: its image manifest cut
 * down to the assets whose bytes actually arrived.
 *
 * A file's manifest is config, so import returns it untouched — but an entry with
 * no bytes behind it claims an asset the editor cannot draw, and the Render
 * Source resolves to that image rather than falling through to the Input's
 * Symbol (a placement carries `imageId` **or** `symbolId`, never both). Narrowing
 * here keeps "the manifest lists what we have" true, which is what the fallback
 * in `resolveRenderSource` reads. The dropped reference is not recoverable — the
 * bytes were never there to begin with.
 */
export function withAvailableImages(
  project: Project,
  images: PersistedImage[],
): Project {
  const arrived = new Set(images.map((image) => image.id));
  return {
    ...project,
    images: project.images.filter((a) => arrived.has(a.id)),
  };
}

/**
 * Parse an uploaded project file (either format), or `null` if it is not a valid
 * project file. ZIPs are detected by their `PK` signature, not the extension, so
 * a mislabeled file still works.
 */
export async function importProjectFile(
  file: File,
): Promise<ImportedProject | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return isZip(bytes) ? importZip(bytes) : importJson(bytes);
}

function importJson(bytes: Uint8Array): ImportedProject | null {
  const project = parseConfig(strFromU8(bytes));
  return project ? { project, fonts: [], images: [] } : null;
}

function importZip(bytes: Uint8Array): ImportedProject | null {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    return null;
  }

  const configBytes = entries[CONFIG_ENTRY];
  if (!configBytes) return null;
  const project = parseConfig(strFromU8(configBytes));
  if (!project) return null;

  // An image's manifest entry is the source of truth for its name and type, so
  // only entries the config still knows about are restored — a stale byte blob
  // has nothing to describe it and nothing referencing it.
  const images: PersistedImage[] = [];
  for (const asset of project.images) {
    const bytes = entries[`${IMAGE_PREFIX}${asset.id}`];
    if (bytes) {
      images.push({
        ...asset,
        blob: new Blob([bytes.slice()], { type: asset.type }),
      });
    }
  }

  // Fonts walk their manifest exactly as images do. (This replaced a "the font
  // is whatever entry is left over" heuristic, which read the family off the
  // config and could not survive a second font.) The blob is deliberately
  // untyped: `FontFace` sniffs the bytes, so there is no MIME to preserve.
  const fonts: PersistedFont[] = [];
  for (const asset of project.fonts) {
    const bytes = entries[`${FONT_PREFIX}${asset.fileName}`];
    if (bytes) fonts.push({ ...asset, blob: new Blob([bytes.slice()]) });
  }

  return { project, fonts, images };
}

/** ZIP local-file-header magic: the ASCII bytes "PK". */
function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

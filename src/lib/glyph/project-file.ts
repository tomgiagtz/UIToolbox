/**
 * Project files — the Save/Load format for the Input Glyph Creator.
 *
 * A saved project is either:
 *
 * - a **JSON** file (`{name}.json`) carrying just the config, or
 * - a **ZIP** file (`{name}.zip`) bundling that same `config.json` alongside the
 *   original uploaded font file (unmodified bytes, not base64-blobbed), so a
 *   project is portable between machines without re-uploading the font.
 *
 * The config inside both is the exact versioned envelope ProjectStore persists
 * to `localStorage` (see {@link serializeConfig} / {@link parseConfig}), so
 * files and browser storage are interchangeable.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { ExportArtifact } from "@/lib/glyph/exporter";
import { DEFAULT_PROJECT_NAME } from "@/lib/glyph/presets";
import {
  parseConfig,
  serializeConfig,
  type PersistedFont,
} from "@/lib/glyph/project-store";
import type { Project } from "@/lib/glyph/types";

/** The config's entry name inside a project ZIP. */
const CONFIG_ENTRY = "config.json";

/** A project restored from a file: its config, plus the bundled font if any. */
export interface ImportedProject {
  project: Project;
  font: PersistedFont | null;
}

/**
 * Build a downloadable project file. With a `font`, produces a ZIP of
 * `config.json` + the font file; without one, a plain config JSON.
 */
export async function exportProjectFile(
  project: Project,
  font: PersistedFont | null,
): Promise<ExportArtifact> {
  const base = safeBaseName(project.name);
  const configJson = serializeConfig(project);

  if (!font) {
    return {
      filename: `${base}.json`,
      blob: new Blob([configJson], { type: "application/json" }),
    };
  }

  const fontBytes = new Uint8Array(await font.blob.arrayBuffer());
  const zip = zipSync({
    [CONFIG_ENTRY]: strToU8(configJson),
    [font.fileName]: fontBytes,
  });
  return {
    filename: `${base}.zip`,
    // Copy into a fresh Uint8Array so the Blob owns a plain ArrayBuffer.
    blob: new Blob([zip.slice()], { type: "application/zip" }),
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
  return project ? { project, font: null } : null;
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

  // Any non-config entry is the bundled font. Re-registered under the family the
  // config already carries, so the same family name round-trips (see font.ts).
  const fontEntry = Object.entries(entries).find(([name]) => name !== CONFIG_ENTRY);
  const font: PersistedFont | null = fontEntry
    ? {
        family: project.font.family,
        fileName: fontEntry[0],
        blob: new Blob([fontEntry[1].slice()]),
      }
    : null;

  return { project, font };
}

/** ZIP local-file-header magic: the ASCII bytes "PK". */
function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/** Reduce a config name to a filesystem-safe base filename (no extension). */
export function safeBaseName(name: string): string {
  const safe = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return safe || DEFAULT_PROJECT_NAME;
}

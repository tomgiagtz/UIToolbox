import { zipSync } from "fflate";
import { renderAtlasBlob } from "@/lib/glyph/compositor";
import { safeBaseName } from "@/lib/glyph/naming";
import type { DeviceOutput } from "@/lib/glyph/types";

export interface ExportArtifact {
  filename: string;
  blob: Blob;
}

/** Serialize a Device's TexturePacker metadata as a downloadable JSON Blob. */
export function metadataArtifact(output: DeviceOutput): ExportArtifact {
  const json = JSON.stringify(output.metadata, null, 2);
  return {
    filename: `${output.filename}.json`,
    blob: new Blob([json], { type: "application/json" }),
  };
}

/**
 * Produce the two downloadable artifacts for a Device: the Sprite Atlas PNG and
 * its TexturePacker-format JSON sidecar. This is the v1 {@link Exporter} seam;
 * dedicated engine exporters drop in here later (ADR-0003).
 */
export async function exportDevice(
  output: DeviceOutput,
): Promise<{ png: ExportArtifact; json: ExportArtifact }> {
  const pngBlob = await renderAtlasBlob(output);
  return {
    png: { filename: `${output.filename}.png`, blob: pngBlob },
    json: metadataArtifact(output),
  };
}

/**
 * Reduce an export selection to the single file the browser should download.
 *
 * One artifact downloads as itself; several are bundled flat into one
 * `{project-name}.zip`. Beyond being tidier than a folder of loose files, the
 * bundle sidesteps Chromium coalescing rapid back-to-back programmatic
 * downloads triggered from a single click (issue #21).
 */
export async function bundleArtifacts(
  artifacts: ExportArtifact[],
  projectName: string,
): Promise<ExportArtifact> {
  if (artifacts.length === 0) {
    throw new Error("bundleArtifacts: nothing selected to export");
  }
  if (artifacts.length === 1) return artifacts[0];

  const entries: Record<string, Uint8Array> = {};
  for (const { filename, blob } of artifacts) {
    entries[uniqueEntry(filename, entries)] = new Uint8Array(
      await blob.arrayBuffer(),
    );
  }
  const zip = zipSync(entries);
  return {
    filename: `${safeBaseName(projectName)}.zip`,
    blob: new Blob([zip.slice()], { type: "application/zip" }),
  };
}

/**
 * A ZIP entry name that isn't taken yet, suffixing `-2`, `-3`, … before the
 * extension. Two Devices can produce one filename — the output-filename template
 * is the user's to edit, and dropping `{device}` from it names them all alike —
 * and a plain record would keep only the last, silently exporting fewer files
 * than the user asked for.
 */
function uniqueEntry(filename: string, taken: Record<string, unknown>): string {
  if (!(filename in taken)) return filename;
  const dot = filename.lastIndexOf(".");
  const [base, ext] =
    dot > 0 ? [filename.slice(0, dot), filename.slice(dot)] : [filename, ""];
  let n = 2;
  while (`${base}-${n}${ext}` in taken) n++;
  return `${base}-${n}${ext}`;
}

/** Trigger a browser download of a single artifact via a temporary anchor. */
export function downloadArtifact({ filename, blob }: ExportArtifact): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Defer revoking: revoking synchronously can abort an in-flight download,
  // which matters when two artifacts are downloaded back-to-back.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

import { zipSync } from "fflate";
import {
  renderAtlasBlob,
  type AtlasRenderInputs,
} from "@/lib/glyph/compositor";
// project-file only imports this module's types, so this stays a one-way
// runtime dependency.
import { safeBaseName } from "@/lib/glyph/project-file";
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
  inputs: AtlasRenderInputs,
): Promise<{ png: ExportArtifact; json: ExportArtifact }> {
  const pngBlob = await renderAtlasBlob(output, inputs);
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
    entries[filename] = new Uint8Array(await blob.arrayBuffer());
  }
  const zip = zipSync(entries);
  return {
    filename: `${safeBaseName(projectName)}.zip`,
    blob: new Blob([zip.slice()], { type: "application/zip" }),
  };
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

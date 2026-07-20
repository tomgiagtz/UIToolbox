import {
  renderAtlasBlob,
  type AtlasRenderInputs,
} from "@/lib/glyph/compositor";
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
 * Trigger downloads of several artifacts, spaced slightly apart.
 *
 * Chromium drops rapid back-to-back programmatic downloads triggered from a
 * single click, so a small gap between each keeps every file (e.g. the PNG +
 * its JSON sidecar) from being coalesced away.
 */
export async function downloadArtifacts(
  artifacts: ExportArtifact[],
): Promise<void> {
  for (let i = 0; i < artifacts.length; i++) {
    if (i > 0) await delay(150);
    downloadArtifact(artifacts[i]);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

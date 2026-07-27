// @vitest-environment node
//
// bundleArtifacts touches only Blob/fflate, no DOM. jsdom's Blob omits
// arrayBuffer(); Node's (like every real browser) implements it, so the zip
// round-trip runs under the Node environment.
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { bundleArtifacts, type ExportArtifact } from "@/lib/glyph/exporter";

function artifact(filename: string, body: string): ExportArtifact {
  return { filename, blob: new Blob([body]) };
}

async function entries(blob: Blob): Promise<Record<string, string>> {
  const unzipped = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  return Object.fromEntries(
    Object.entries(unzipped).map(([name, bytes]) => [name, strFromU8(bytes)]),
  );
}

describe("bundleArtifacts", () => {
  it("passes a lone artifact through untouched, so it downloads as itself", async () => {
    const only = artifact("keyboard_atlas.png", "png-bytes");
    expect(await bundleArtifacts([only], "My Cool Glyphs")).toBe(only);
  });

  it("zips several artifacts into one project-named archive", async () => {
    const bundle = await bundleArtifacts(
      [
        artifact("keyboard_atlas.png", "keyboard-png"),
        artifact("keyboard_atlas.json", "keyboard-json"),
        artifact("xbox_atlas.png", "xbox-png"),
      ],
      "My Cool Glyphs",
    );

    expect(bundle.filename).toBe("My-Cool-Glyphs.zip");
    expect(bundle.blob.type).toBe("application/zip");
    expect(await entries(bundle.blob)).toEqual({
      "keyboard_atlas.png": "keyboard-png",
      "keyboard_atlas.json": "keyboard-json",
      "xbox_atlas.png": "xbox-png",
    });
  });

  it("falls back to the default base name when the project name is unusable", async () => {
    const bundle = await bundleArtifacts(
      [artifact("a.png", "a"), artifact("b.json", "b")],
      "   ",
    );
    expect(bundle.filename).toBe("my-glyphs.zip");
  });

  it("keeps both files when two Devices produce the same filename", async () => {
    // The output-filename template is the user's to edit; dropping {device}
    // from it names every Device's atlas alike.
    const bundle = await bundleArtifacts(
      [
        artifact("atlas.png", "keyboard-png"),
        artifact("atlas.png", "xbox-png"),
        artifact("atlas.png", "playstation-png"),
      ],
      "glyphs",
    );

    expect(await entries(bundle.blob)).toEqual({
      "atlas.png": "keyboard-png",
      "atlas-2.png": "xbox-png",
      "atlas-3.png": "playstation-png",
    });
  });

  it("rejects an empty selection rather than downloading an empty zip", async () => {
    await expect(bundleArtifacts([], "My Cool Glyphs")).rejects.toThrow();
  });
});

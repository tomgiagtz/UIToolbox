import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Download, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { expectNoA11yViolations } from "./axe";

const FONT_PATH = path.join(__dirname, "fixtures", "test-font.ttf");
/** A deliberately non-square SVG, so aspect-fit is exercised too (issue #20). */
const IMAGE_PATH = path.join(__dirname, "fixtures", "test-image.svg");

function isPowerOfTwo(n: number): boolean {
  return n >= 1 && (n & (n - 1)) === 0;
}

/** Parse a PNG's width/height from its IHDR chunk (bytes 16–23). */
function pngDimensions(buf: Buffer): { width: number; height: number } {
  const signature = buf.subarray(0, 8).toString("hex");
  expect(signature).toBe("89504e470d0a1a0a");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function readDownload(download: Download): Promise<Buffer> {
  const path = await download.path();
  return readFile(path);
}

/** The files inside a downloaded export bundle, keyed by entry name. */
async function bundleEntries(
  download: Download,
): Promise<Record<string, Buffer>> {
  const unzipped = unzipSync(await readDownload(download));
  return Object.fromEntries(
    Object.entries(unzipped).map(([name, bytes]) => [name, Buffer.from(bytes)]),
  );
}

/**
 * Drive the Export modal (#21): open it, let the caller adjust the selection,
 * then confirm and hand back the one download it triggers.
 */
async function exportFrom(
  page: Page,
  configure?: (dialog: ReturnType<Page["getByRole"]>) => Promise<void>,
): Promise<Download> {
  await page.getByRole("button", { name: "Export…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await configure?.(dialog);

  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  return downloadPromise;
}

test.describe("Input Glyph Creator", () => {
  test("previews and exports with the bundled default font — no upload", async ({
    page,
  }) => {
    await page.goto("/tools/glyph-creator");

    // With Inter bundled (#13), the preview renders and Export is available
    // immediately — no font upload required.
    await expect(
      page.getByRole("img", { name: /Keyboard Sprite Atlas preview/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Export…" })).toBeEnabled();

    // Export bundles the PNG + JSON using only the default font.
    const download = await exportFrom(page);
    expect(Object.keys(await bundleEntries(download)).sort()).toEqual([
      "keyboard_atlas.json",
      "keyboard_atlas.png",
    ]);
  });

  test("an uploaded font overrides the default for preview + export", async ({
    page,
  }) => {
    await page.goto("/tools/glyph-creator");

    await page.getByLabel("Font file").setInputFiles(FONT_PATH);

    // Live packed-atlas preview reflects the uploaded font.
    await expect(
      page.getByRole("img", { name: /Keyboard Sprite Atlas preview/i }),
    ).toBeVisible();

    await expect(page.getByRole("button", { name: "Export…" })).toBeEnabled();

    // One download, holding the PNG atlas and its JSON sidecar.
    const download = await exportFrom(page);
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    const entries = await bundleEntries(download);

    // The atlas PNG has power-of-two dimensions.
    const { width, height } = pngDimensions(entries["keyboard_atlas.png"]);
    expect(isPowerOfTwo(width), `width ${width} should be pow2`).toBe(true);
    expect(isPowerOfTwo(height), `height ${height} should be pow2`).toBe(true);

    // The JSON is a TexturePacker doc whose meta.size matches the PNG.
    const doc = JSON.parse(entries["keyboard_atlas.json"].toString("utf8"));
    expect(doc.meta.size).toEqual({ w: width, h: height });
    expect(Object.keys(doc.frames).length).toBeGreaterThan(0);
    // Sprite Names are slug-normalized (lowercase, no spaces).
    for (const name of Object.keys(doc.frames)) {
      expect(name).toMatch(/^[a-z0-9_]+$/);
    }
  });

  test("bundles one atlas + JSON per Device picked in the Export modal", async ({
    page,
  }) => {
    await page.goto("/tools/glyph-creator");
    await page.getByLabel("Font file").setInputFiles(FONT_PATH);
    await expect(
      page.getByRole("img", { name: /Keyboard Sprite Atlas preview/i }),
    ).toBeVisible();

    // Add a second Device; each Device picked in the modal yields its own
    // atlas + JSON, and the four files arrive as one .zip.
    await page.getByRole("checkbox", { name: "Xbox" }).check();

    const download = await exportFrom(page);
    expect(download.suggestedFilename()).toBe("my-glyphs.zip");
    expect(Object.keys(await bundleEntries(download)).sort()).toEqual([
      "keyboard_atlas.json",
      "keyboard_atlas.png",
      "xbox_atlas.json",
      "xbox_atlas.png",
    ]);
  });

  test("exports only the Devices and file types left checked", async ({
    page,
  }) => {
    await page.goto("/tools/glyph-creator");
    await expect(
      page.getByRole("img", { name: /Keyboard Sprite Atlas preview/i }),
    ).toBeVisible();
    await page.getByRole("checkbox", { name: "Xbox" }).check();

    // Drop the Keyboard and the metadata: one file left, so it downloads bare
    // rather than as a single-entry .zip.
    const download = await exportFrom(page, async (dialog) => {
      await dialog.getByRole("checkbox", { name: "Keyboard" }).uncheck();
      await dialog.getByRole("checkbox", { name: /Metadata/ }).uncheck();
    });

    expect(download.suggestedFilename()).toBe("xbox_atlas.png");
    const { width } = pngDimensions(await readDownload(download));
    expect(isPowerOfTwo(width), `width ${width} should be pow2`).toBe(true);
  });

  test("restores config + font after a reload without re-uploading", async ({
    page,
  }) => {
    await page.goto("/tools/glyph-creator");
    await page.getByLabel("Font file").setInputFiles(FONT_PATH);
    await expect(
      page.getByRole("img", { name: /Keyboard Sprite Atlas preview/i }),
    ).toBeVisible();

    // Edit a persisted axis so the reload proves config — not just the font —
    // survives. Adding Xbox also gives us a second, distinct checkbox state.
    const xbox = page.getByRole("checkbox", { name: "Xbox" });
    await xbox.check();
    await expect(xbox).toBeChecked();

    await page.reload();

    // Font restored from IndexedDB: the preview grid renders with no re-upload.
    await expect(
      page.getByRole("img", { name: /Keyboard Sprite Atlas preview/i }),
    ).toBeVisible();
    // Config restored from localStorage: the Xbox selection persisted.
    await expect(page.getByRole("checkbox", { name: "Xbox" })).toBeChecked();
  });

  test("saves a project to a ZIP and restores it via Load after a Delete", async ({
    page,
  }) => {
    await page.goto("/tools/glyph-creator");
    await page.getByLabel("Font file").setInputFiles(FONT_PATH);
    await expect(
      page.getByRole("img", { name: /Keyboard Sprite Atlas preview/i }),
    ).toBeVisible();

    // Edit a persisted axis so we can prove config restores, not just the font.
    await page.getByRole("checkbox", { name: "Xbox" }).check();

    // Save with the font bundled → a .zip download.
    await page.getByRole("button", { name: "Save…" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("checkbox", { name: /include font/i }),
    ).toBeChecked();
    const downloadPromise = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    const savedPath = await download.path();

    // Delete resets the config (accept the confirm prompt). The preview stays
    // visible on the bundled Inter (#13); the Xbox reset proves the config
    // itself was cleared.
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(
      page.getByRole("checkbox", { name: "Xbox" }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("img", { name: /Keyboard Sprite Atlas preview/i }),
    ).toBeVisible();

    // Load the saved ZIP: font + config come back with no re-upload.
    await page.getByLabel("Load project file").setInputFiles(savedPath!);
    await expect(
      page.getByRole("img", { name: /Keyboard Sprite Atlas preview/i }),
    ).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Xbox" })).toBeChecked();
  });

  test("draws an uploaded custom image on the tile in preview + export", async ({
    page,
  }) => {
    await page.goto("/tools/glyph-creator");
    const preview = page.getByRole("img", {
      name: /Keyboard Sprite Atlas preview/i,
    });
    await expect(preview).toBeVisible();

    // Baseline export, before any image exists, to compare the atlas against.
    // Only the PNG is needed, so it downloads bare.
    const pngOnly = async (dialog: ReturnType<Page["getByRole"]>) => {
      await dialog.getByRole("checkbox", { name: /Metadata/ }).uncheck();
    };
    const before = await readDownload(await exportFrom(page, pngOnly));

    // Pick a Glyph by clicking its cell, then give it a custom image. The
    // canvas centre lands inside a cell — the gutters are 2px.
    await preview.click();
    await expect(
      page.getByRole("region", { name: /edit glyph/i }),
    ).toBeVisible();

    const pixels = () =>
      preview.evaluate((c) => (c as HTMLCanvasElement).toDataURL());
    const beforePixels = await pixels();

    await page.getByLabel("Upload image").setInputFiles(IMAGE_PATH);

    // The Glyph switched to the image, which is now the pick in the manifest.
    await expect(page.getByRole("radio", { name: "Image" })).toBeChecked();
    await expect(page.getByLabel("Image file")).toHaveValue(/img-1\.svg/);

    // The live preview redrew with the image on the tile. Rasterization is
    // asynchronous, so poll rather than reading the canvas once.
    await expect
      .poll(pixels, { message: "preview should redraw with the image" })
      .not.toBe(beforePixels);

    // Scaling the content redraws it again, at a different size on the tile.
    const withImage = await pixels();
    // Scoped to the popover: the sidebar carries the same control at Project scope.
    await page
      .getByRole("region", { name: /edit glyph/i })
      .getByLabel(/content scale/i)
      .fill("1.5");
    await expect
      .poll(pixels, { message: "preview should redraw at the new scale" })
      .not.toBe(withImage);

    // The exported atlas differs from the baseline: the compositor drew it too.
    const after = await readDownload(await exportFrom(page, pngOnly));
    expect(after.equals(before)).toBe(false);
  });

  test("has no WCAG 2.1 AA violations", async ({ page }, testInfo) => {
    await page.goto("/tools/glyph-creator");
    await page.getByLabel("Font file").setInputFiles(FONT_PATH);
    await expect(
      page.getByRole("img", { name: /Keyboard Sprite Atlas preview/i }),
    ).toBeVisible();
    await expectNoA11yViolations(page, testInfo);
  });
});

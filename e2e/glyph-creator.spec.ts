import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Download } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

const FONT_PATH = path.join(__dirname, "fixtures", "test-font.ttf");

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

test.describe("Input Glyph Creator", () => {
  test("previews and generates with the bundled default font — no upload", async ({
    page,
  }) => {
    await page.goto("/tools/glyph-creator");

    // With Inter bundled (#13), the preview renders and Generate is available
    // immediately — no font upload required.
    const generate = page.getByRole("button", { name: /generate/i });
    await expect(
      page.getByRole("img", { name: /Keyboard Sprite Atlas preview/i }),
    ).toBeVisible();
    await expect(generate).toBeEnabled();

    // Generate emits the PNG + JSON downloads using only the default font.
    const defaultDownloads: Download[] = [];
    page.on("download", (d) => defaultDownloads.push(d));
    await generate.click();
    await expect.poll(() => defaultDownloads.length).toBe(2);
  });

  test("an uploaded font overrides the default for preview + generation", async ({
    page,
  }) => {
    await page.goto("/tools/glyph-creator");

    const generate = page.getByRole("button", { name: /generate/i });
    await page.getByLabel("Font file").setInputFiles(FONT_PATH);

    // Live packed-atlas preview reflects the uploaded font.
    await expect(
      page.getByRole("img", { name: /Keyboard Sprite Atlas preview/i }),
    ).toBeVisible();

    await expect(generate).toBeEnabled();

    // Generate emits two downloads: the PNG atlas and the JSON sidecar.
    // Collect via page.on so both distinct events are captured (two
    // concurrent waitForEvent listeners can both latch onto the first event).
    const downloads: Download[] = [];
    page.on("download", (d) => downloads.push(d));

    await generate.click();
    await expect.poll(() => downloads.length).toBe(2);

    const png = downloads.find((d) => d.suggestedFilename().endsWith(".png"));
    const json = downloads.find((d) => d.suggestedFilename().endsWith(".json"));
    expect(png, "expected a .png download").toBeTruthy();
    expect(json, "expected a .json download").toBeTruthy();

    // The atlas PNG has power-of-two dimensions.
    const { width, height } = pngDimensions(await readDownload(png!));
    expect(isPowerOfTwo(width), `width ${width} should be pow2`).toBe(true);
    expect(isPowerOfTwo(height), `height ${height} should be pow2`).toBe(true);

    // The JSON is a TexturePacker doc whose meta.size matches the PNG.
    const doc = JSON.parse((await readDownload(json!)).toString("utf8"));
    expect(doc.meta.size).toEqual({ w: width, h: height });
    expect(Object.keys(doc.frames).length).toBeGreaterThan(0);
    // Sprite Names are slug-normalized (lowercase, no spaces).
    for (const name of Object.keys(doc.frames)) {
      expect(name).toMatch(/^[a-z0-9_]+$/);
    }
  });

  test("generates one atlas + JSON per selected Device", async ({ page }) => {
    await page.goto("/tools/glyph-creator");
    await page.getByLabel("Font file").setInputFiles(FONT_PATH);
    await expect(
      page.getByRole("img", { name: /Keyboard Sprite Atlas preview/i }),
    ).toBeVisible();

    // Add a second Device; each selected Device yields its own atlas + JSON.
    await page.getByRole("checkbox", { name: "Xbox" }).check();

    const downloads: Download[] = [];
    page.on("download", (d) => downloads.push(d));

    await page.getByRole("button", { name: /generate/i }).click();
    await expect.poll(() => downloads.length).toBe(4);

    const names = downloads.map((d) => d.suggestedFilename()).sort();
    expect(names).toEqual([
      "keyboard_atlas.json",
      "keyboard_atlas.png",
      "xbox_atlas.json",
      "xbox_atlas.png",
    ]);
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

  test("has no WCAG 2.1 AA violations", async ({ page }, testInfo) => {
    await page.goto("/tools/glyph-creator");
    await page.getByLabel("Font file").setInputFiles(FONT_PATH);
    await expect(
      page.getByRole("img", { name: /Keyboard Sprite Atlas preview/i }),
    ).toBeVisible();
    await expectNoA11yViolations(page, testInfo);
  });
});

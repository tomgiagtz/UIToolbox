import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  expect,
  test,
  type Download,
  type Locator,
  type Page,
} from "@playwright/test";
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

/**
 * Upload a custom image through the Assets window.
 *
 * Uploading is *having* art, which is the window's job; the Style panel only
 * *picks* from what the project already has (ADR-0014). Returns the filename,
 * which is the caption on the tile the pickers then offer.
 */
async function uploadImage(page: Page, file = IMAGE_PATH): Promise<string> {
  const name = path.basename(file);
  await page.getByRole("button", { name: /^Assets/ }).click();
  const assets = page.getByRole("dialog", { name: "Assets" });
  await expect(assets).toBeVisible();
  await assets.getByLabel("Upload an image").setInputFiles(file);
  await expect(assets.getByText(name)).toBeVisible();
  await assets.getByRole("button", { name: "Close" }).click();
  await expect(assets).toBeHidden();
  return name;
}

/** One tile in a Style panel artwork grid, by the caption under it (#45). */
function tile(scope: Locator, grid: string, label: string): Locator {
  return scope
    .getByRole("listbox", { name: grid })
    .getByRole("option", { name: label, exact: true });
}

/** Assert which tile a grid has picked — the grid replaced a `<select>`. */
async function expectPicked(scope: Locator, grid: string, label: string) {
  await expect(tile(scope, grid, label)).toHaveAttribute(
    "aria-selected",
    "true",
  );
}

/**
 * The one `images/` entry in a save, by its ZIP entry name.
 *
 * Ids are minted from the uploaded filename rather than counted, so the tag
 * after the stem is not predictable — matching the stem is the most an assertion
 * can honestly say — and that the stem is there at all is the point (ADR-0014
 * §6). `slugify` joins words on underscores, so `test-image.svg` stems to
 * `test_image`.
 */
function imageEntryName(entries: Record<string, unknown>): string {
  const names = Object.keys(entries).filter((name) =>
    /^images\/test_image-.+\.svg$/.test(name),
  );
  // Name the entries on failure: "expected 1, got 0" alone would not say
  // whether the image was missing or merely minted under a name we misread.
  expect(names, `entries: ${Object.keys(entries).join(" | ")}`).toHaveLength(1);
  return names[0];
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

    await page
      .getByLabel("Upload a font", { exact: true })
      .setInputFiles(FONT_PATH);

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
    await page
      .getByLabel("Upload a font", { exact: true })
      .setInputFiles(FONT_PATH);
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
    await page
      .getByLabel("Upload a font", { exact: true })
      .setInputFiles(FONT_PATH);
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
    await page
      .getByLabel("Upload a font", { exact: true })
      .setInputFiles(FONT_PATH);
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
      dialog.getByRole("checkbox", { name: /include fonts/i }),
    ).toBeChecked();
    const downloadPromise = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    const savedPath = await download.path();

    // Delete resets the config (accept the confirm prompt). The preview stays
    // visible on the bundled default (#13); the Xbox reset proves the config
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

  test("bundles image bytes the browser store lost but the editor still has", async ({
    page,
  }) => {
    // `saveImage` swallows a failed IndexedDB write (private mode, quota), so the
    // store can be missing an image the user uploaded and can see on the tile.
    // The save follows the screen, not the store: what draws, ships (#23).
    await page.goto("/tools/glyph-creator");
    const preview = page.getByRole("img", {
      name: /Keyboard Sprite Atlas preview/i,
    });
    await expect(preview).toBeVisible();

    await preview.click();
    await expect(
      page.getByRole("region", { name: /edit glyph/i }),
    ).toBeVisible();
    const panel = page.getByRole("region", { name: /edit glyph/i });
    const imageName = await uploadImage(page);
    await tile(panel, "Render Source", imageName).click();
    await expectPicked(panel, "Render Source", imageName);

    // Empty the images store behind the editor's back — the runtime registry
    // still holds the bytes, exactly as it would had the write never landed.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.open("uitoolbox");
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("images", "readwrite");
            tx.objectStore("images").clear();
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );

    await page.getByRole("button", { name: "Save…" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    const download = await downloadPromise;

    // Still a ZIP, still carrying the bytes — not a config referencing art that
    // never shipped.
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    const entries = unzipSync(await readDownload(download));
    expect(entries[imageEntryName(entries)].length).toBeGreaterThan(0);
  });

  test("a config-only load falls back rather than reusing the last project's image bytes", async ({
    page,
  }) => {
    // Loading a config that arrived without its bytes must degrade to the
    // label/Symbol rather than draw whatever the last project left under that
    // id — see `replaceImages` for why the ids collide at all (#23).
    await page.goto("/tools/glyph-creator");
    const preview = page.getByRole("img", {
      name: /Keyboard Sprite Atlas preview/i,
    });
    await expect(preview).toBeVisible();
    const pixels = () =>
      preview.evaluate((c) => (c as HTMLCanvasElement).toDataURL());

    // Give a Glyph a custom image, then save — images always travel, so a ZIP.
    await preview.click();
    await expect(
      page.getByRole("region", { name: /edit glyph/i }),
    ).toBeVisible();
    const plainPixels = await pixels();
    // Uploading alone changes nothing on screen — the window never picks — so
    // the Glyph is pointed at the new image afterwards.
    const imageName = await uploadImage(page);
    await tile(
      page.getByRole("region", { name: /edit glyph/i }),
      "Render Source",
      imageName,
    ).click();
    await expect
      .poll(pixels, { message: "preview should redraw with the image" })
      .not.toBe(plainPixels);

    await page.getByRole("button", { name: "Save…" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    const zipBytes = await readDownload(await downloadPromise);
    const entries = unzipSync(zipBytes);
    expect(entries[imageEntryName(entries)].length).toBeGreaterThan(0);

    // The same config as a bare JSON — what sharing a save without its assets
    // produces. Written next to the ZIP so the Load input can pick it up.
    const dir = await mkdtemp(path.join(tmpdir(), "uitb-config-only-"));
    const jsonPath = path.join(dir, "config-only.json");
    await writeFile(jsonPath, Buffer.from(entries["config.json"]));

    await page.getByLabel("Load project file").setInputFiles(jsonPath);
    // Exactly the pre-upload render, not merely "something else": the Glyph is
    // back on its label/Symbol, which is what the fallback owes.
    await expect
      .poll(pixels, {
        message: "config-only load must not draw the old project's bytes",
      })
      .toBe(plainPixels);

    // And the drop has to have reached IndexedDB, not just the in-memory
    // registry — a reload re-registers whatever is still persisted, so a stale
    // blob would come back and redraw here.
    await page.reload();
    await expect(preview).toBeVisible();
    await expect
      .poll(pixels, { message: "a reload must not resurrect the old bytes" })
      .toBe(plainPixels);
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

    const imageName = await uploadImage(page);
    const panel = page.getByRole("region", { name: /edit glyph/i });
    await tile(panel, "Render Source", imageName).click();

    // The Glyph switched to the image, which is now the pick in the grid.
    await expectPicked(panel, "Render Source", imageName);

    // The live preview redrew with the image on the tile. Rasterization is
    // asynchronous, so poll rather than reading the canvas once.
    await expect
      .poll(pixels, { message: "preview should redraw with the image" })
      .not.toBe(beforePixels);

    // Scaling the content redraws it again, at a different size on the tile.
    const withImage = await pixels();
    // Scoped to the popover: the sidebar carries the same control at Project
    // scope. The box rather than the slider beside it, since `fill` types a value.
    await page
      .getByRole("region", { name: /edit glyph/i })
      .getByRole("spinbutton", { name: /foreground transform scale X/i })
      .fill("1.5");
    await expect
      .poll(pixels, { message: "preview should redraw at the new scale" })
      .not.toBe(withImage);

    // The exported atlas differs from the baseline: the compositor drew it too.
    const after = await readDownload(await exportFrom(page, pngOnly));
    expect(after.equals(before)).toBe(false);
  });

  test("draws an uploaded Background tile in preview + export (#22)", async ({
    page,
  }) => {
    await page.goto("/tools/glyph-creator");
    const preview = page.getByRole("img", {
      name: /Keyboard Sprite Atlas preview/i,
    });
    await expect(preview).toBeVisible();

    const pngOnly = async (dialog: ReturnType<Page["getByRole"]>) => {
      await dialog.getByRole("checkbox", { name: /Metadata/ }).uncheck();
    };
    const before = await readDownload(await exportFrom(page, pngOnly));

    await preview.click();
    const panel = page.getByRole("region", { name: /edit glyph/i });
    await expect(panel).toBeVisible();

    const pixels = () =>
      preview.evaluate((c) => (c as HTMLCanvasElement).toDataURL());
    const beforePixels = await pixels();

    // The grid, not the heading beside it: both carry the field's name, and so
    // does the reset control once the source is overridden here.
    await expectPicked(panel, "Background source", "Shape");

    const imageName = await uploadImage(page);
    await tile(panel, "Background source", imageName).click();

    // The upload became this Glyph's tile.
    await expectPicked(panel, "Background source", imageName);
    // Fill and border tint a shape or an Authored tile; an uploaded one draws
    // as authored, so those controls step aside.
    await expect(panel.getByLabel("Background fill")).toHaveCount(0);

    // The live preview redrew with the tile. Rasterization is asynchronous, so
    // poll rather than reading the canvas once.
    await expect
      .poll(pixels, { message: "preview should redraw with the tile" })
      .not.toBe(beforePixels);

    // The exported atlas differs from the baseline: the compositor drew it too.
    const after = await readDownload(await exportFrom(page, pngOnly));
    expect(after.equals(before)).toBe(false);
  });

  test("has no WCAG 2.1 AA violations", async ({ page }, testInfo) => {
    await page.goto("/tools/glyph-creator");
    await page
      .getByLabel("Upload a font", { exact: true })
      .setInputFiles(FONT_PATH);
    await expect(
      page.getByRole("img", { name: /Keyboard Sprite Atlas preview/i }),
    ).toBeVisible();
    await expectNoA11yViolations(page, testInfo);
  });

  test("the Assets window has no WCAG 2.1 AA violations", async ({
    page,
  }, testInfo) => {
    // Scanned with an image in it, since an empty section is the easy case: the
    // rows carry the art, the Used/Unused state, and the arming Remove button.
    await page.goto("/tools/glyph-creator");
    await expect(
      page.getByRole("img", { name: /Keyboard Sprite Atlas preview/i }),
    ).toBeVisible();
    await uploadImage(page);

    await page.getByRole("button", { name: /^Assets/ }).click();
    await expect(page.getByRole("dialog", { name: "Assets" })).toBeVisible();
    await expectNoA11yViolations(page, testInfo);
  });
});

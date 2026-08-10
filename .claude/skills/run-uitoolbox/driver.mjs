/**
 * Browser driver for UIToolbox — a stdin REPL over Playwright.
 *
 *   node .claude/skills/run-uitoolbox/driver.mjs
 *
 * It starts `next dev` itself, opens the Input Glyph Creator, and then reads one
 * command per line from stdin. Every command prints a line starting with `ok` or
 * `err`, so it drives fine from a heredoc, a pipe, or tmux send-keys.
 *
 * Agent tooling, not product surface — add commands as you need them.
 */
import { execFileSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { unzipSync } from "fflate";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const SHOTS = path.join(HERE, "shots");
const FONT = path.join(ROOT, "e2e/fixtures/test-font.ttf");
const IMAGE = path.join(ROOT, "e2e/fixtures/test-image.svg");
const PORT = Number(process.env.PORT ?? 3100);
const BASE = `http://localhost:${PORT}`;
const GLYPH = "/tools/glyph-creator";
/** Headed when HEADED=1 — useful only if you have a display. */
const HEADLESS = process.env.HEADED !== "1";

const HELP = `commands:
  goto [path]            navigate (default ${GLYPH})
  ss [name]              screenshot -> .claude/skills/run-uitoolbox/shots/<name>.png
  preview                canvas size + a hash of its pixels (changes = a redraw)
  pick [nth]             click the nth atlas cell (default 0) -> opens the Glyph editor
  controls [filter]      list role+accessible-name of every visible control
  font                   upload e2e/fixtures/test-font.ttf
  image                  upload e2e/fixtures/test-image.svg into the open Glyph editor
  device <name>          check a Device checkbox, e.g. "device Xbox"
  set <name> = <value>   fill the spinbutton/textbox whose name matches <name>
  click <name>           click the button whose accessible name matches <name>
  export                 run the Export flow, print the bundle's entry names
  eval <js>              page.evaluate(<js>) and print the JSON result
  console                print console messages + page errors seen so far
  help | quit`;

mkdirSync(SHOTS, { recursive: true });

const alive = async () => {
  try {
    return (await fetch(BASE, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
};

/**
 * Wait for the dev server to answer, then hand back the child process — or
 * `null` when one is already listening. Reuse is safe here and only here: `next
 * dev` recompiles from source, so a leftover server is never serving stale code
 * (which is exactly why `playwright.config.ts` refuses to reuse `npm run start`).
 */
async function startServer() {
  if (await alive()) {
    console.error(`[dev] reusing the server already on ${BASE}`);
    return null;
  }
  const child = spawn("npm", ["run", "dev", "--", "--port", String(PORT)], {
    cwd: ROOT,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (b) => process.stderr.write(`[dev] ${b}`));
  child.stderr.on("data", (b) => process.stderr.write(`[dev] ${b}`));

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await alive()) return child;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`dev server never came up on ${BASE}`);
}

const server = await startServer();
const browser = await chromium.launch({ headless: HEADLESS });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));

const preview = () => page.getByRole("img", { name: /Sprite Atlas preview/i });
/** The Glyph editor popover, when one is open — most controls exist twice. */
const editor = () => page.getByRole("region", { name: /edit glyph/i });
/** Prefer the open editor popover, so `set` doesn't hit the sidebar's twin. */
const scope = async () => ((await editor().count()) ? editor() : page);

async function shot(name = `shot-${Date.now()}`) {
  const file = path.join(SHOTS, `${name.replace(/\.png$/, "")}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

/** A hash of the preview canvas' pixels — compare across steps to prove a redraw. */
async function previewState() {
  const canvas = preview();
  await canvas.waitFor({ state: "visible", timeout: 30_000 });
  const url = await canvas.evaluate((c) => c.toDataURL());
  const box = await canvas.boundingBox();
  return `${Math.round(box.width)}x${Math.round(box.height)} pixels=${createHash("sha1")
    .update(url)
    .digest("hex")
    .slice(0, 12)}`;
}

async function listControls(filter) {
  const rows = await page.evaluate(() => {
    const sel = "button,input,select,textarea,[role=checkbox],[role=radio],[role=slider]";
    return [...document.querySelectorAll(sel)]
      .filter((el) => el.offsetParent !== null || el.type === "file")
      .map((el) => {
        const id = el.id;
        const label =
          el.getAttribute("aria-label") ??
          (id && document.querySelector(`label[for="${id}"]`)?.textContent) ??
          el.closest("label")?.textContent ??
          el.textContent ??
          "";
        const role = el.getAttribute("role") ?? el.type ?? el.tagName.toLowerCase();
        return `${role}\t${label.trim().replace(/\s+/g, " ")}\t${el.value ?? ""}`;
      });
  });
  const out = filter
    ? rows.filter((r) => r.toLowerCase().includes(filter.toLowerCase()))
    : rows;
  return `${out.length} controls\n${out.join("\n")}`;
}

/** The Export modal: open, confirm, and report what the download contained. */
async function runExport() {
  await page.getByRole("button", { name: "Export…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  const download = await pending;
  const file = path.join(SHOTS, download.suggestedFilename());
  await download.saveAs(file);
  if (!file.endsWith(".zip")) return `${file} (single file)`;
  const { readFileSync } = await import("node:fs");
  const entries = unzipSync(readFileSync(file));
  return `${file}\n${Object.entries(entries)
    .map(([n, b]) => `  ${n} ${b.length}B`)
    .join("\n")}`;
}

async function run(line) {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  const args = rest.join(" ");
  switch (cmd) {
    case "goto":
      await open(args || GLYPH);
      return `at ${page.url()}`;
    case "ss":
      return await shot(args || undefined);
    case "preview":
      return await previewState();
    case "pick": {
      // Cells are laid out on the one canvas, so pick by offset inside its box.
      // The gutters are 2px; a cell centre is a safe target.
      const n = Number(args || 0);
      const canvas = preview();
      await canvas.waitFor({ state: "visible" });
      const box = await canvas.boundingBox();
      const cells = await page.evaluate(() => {
        const c = document.querySelector("canvas");
        return Math.max(1, Math.round(c.width / 130));
      });
      const cell = box.width / cells;
      await canvas.click({
        position: { x: cell * (n % cells) + cell / 2, y: cell * Math.floor(n / cells) + cell / 2 },
      });
      await editor().waitFor({ state: "visible", timeout: 10_000 });
      return `picked cell ${n}; editor open`;
    }
    case "controls":
      return await listControls(args);
    case "font":
      await page.getByLabel("Font file").setInputFiles(FONT);
      return `uploaded ${FONT}`;
    case "image":
      await (await scope()).getByLabel(/Upload image/i).setInputFiles(IMAGE);
      return `uploaded ${IMAGE}`;
    case "device":
      await page.getByRole("checkbox", { name: args }).check();
      return `checked ${args}`;
    case "set": {
      const [name, value] = args.split(/\s*=\s*/);
      const root = await scope();
      const re = new RegExp(name, "i");
      const typed = root
        .getByRole("spinbutton", { name: re })
        .or(root.getByRole("textbox", { name: re }))
        .first();
      if (await typed.count()) {
        await typed.fill(value);
        await typed.blur();
        return `set ${name} = ${value} (typed)`;
      }
      // Sliders can't be `fill`ed. Drive the value through the native setter and
      // dispatch `input`, which is what React's synthetic onChange listens for —
      // `el.value = v` alone updates the DOM and the app never hears about it.
      const slider = root.getByRole("slider", { name: re }).first();
      await slider.waitFor({ state: "visible", timeout: 10_000 });
      await slider.evaluate((el, v) => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        ).set;
        setter.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, value);
      return `set ${name} = ${value} (slider)`;
    }
    case "click":
      await (await scope()).getByRole("button", { name: new RegExp(args, "i") }).first().click();
      return `clicked ${args}`;
    case "export":
      return await runExport();
    case "eval":
      return JSON.stringify(await page.evaluate(`(async()=>(${args}))()`), null, 2);
    case "console":
      return logs.length ? logs.join("\n") : "(no console output)";
    case "help":
    case "":
      return HELP;
    default:
      return `unknown command: ${cmd}\n${HELP}`;
  }
}

/**
 * Never `waitUntil: "networkidle"` here — `next dev` holds an HMR websocket open
 * for the life of the page, so networkidle never fires and every goto times out
 * at 30s. Wait for the canvas instead: it is the thing that has to be there.
 */
async function open(pathname) {
  await page.goto(`${BASE}${pathname}`, { waitUntil: "domcontentloaded" });
  // The first dev-server hit compiles the route, which can outrun the default 30s.
  if (pathname.startsWith(GLYPH))
    await preview().waitFor({ state: "visible", timeout: 120_000 });
}

await open(GLYPH);
console.log(`ok ready ${BASE}${GLYPH} (headless=${HEADLESS})\n${HELP}`);

const rl = createInterface({ input: process.stdin, terminal: false });
for await (const line of rl) {
  if (/^\s*(quit|exit)\s*$/.test(line)) break;
  if (!line.trim()) continue;
  try {
    console.log(`ok ${cmdLabel(line)}\n${await run(line)}`);
  } catch (e) {
    console.log(`err ${cmdLabel(line)}: ${e.message.split("\n")[0]}`);
  }
}

function cmdLabel(line) {
  return line.trim().slice(0, 60);
}

await browser.close();
// `npm run dev` is a shell wrapper around the real `next dev`, so killing the pid
// we spawned orphans the child that actually holds the port — the next run then
// dies with EADDRINUSE. Kill the whole tree, synchronously, before exiting.
if (server) {
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {
      /* already gone */
    }
  } else {
    process.kill(-server.pid, "SIGTERM");
  }
}
process.exit(0);

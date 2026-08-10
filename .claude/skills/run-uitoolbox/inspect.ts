/**
 * Direct-invocation harness for the glyph library — the DOM-free core that most
 * PRs in `src/lib/glyph/` touch. No browser, no dev server.
 *
 *   npx vite-node -c vitest.config.ts .claude/skills/run-uitoolbox/inspect.ts -- --help
 *
 * The `-c vitest.config.ts` is required: that config carries `vite-tsconfig-paths`,
 * without which every `@/lib/glyph/...` import fails to resolve.
 *
 * Edit this file freely — it is agent tooling, not product surface. The point is
 * a place where you can already `import` the internals and print what they return.
 */
import {
  generateTilesets,
  resolveDeviceInputs,
  resolveScopeStyle,
  seedBackgroundSource,
} from "@/lib/glyph/generate";
import { catalogIndex, getCatalog } from "@/lib/glyph/catalog";
import { createDefaultProject, createDeviceFromCatalog } from "@/lib/glyph/defaults";
import type { StyleOverride } from "@/lib/glyph/style";
import type { Project } from "@/lib/glyph/types";

const HELP = `
inspect.ts — print what the glyph core resolves, for a project you describe in flags.

  --catalog <id>       Device catalog to build the project from: keyboard (default), xbox, playstation
  --device <json>      StyleOverride applied at the Device tier, e.g. '{"textColor":"#ff0000"}'
  --glyph <id>         Focus one Input id (e.g. xbox-lb, mouse-left). Prints its
                       Catalog seed and every tier of the cascade resolved in order.
  --glyph-style <json> StyleOverride applied at the Glyph tier for --glyph
  --atlas              Print the packed atlas + TexturePacker metadata instead of styles
  --list               List the chosen catalog's Input ids and exit
`.trimStart();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const has = (name: string) => process.argv.includes(`--${name}`);
const json = (name: string): StyleOverride | undefined => {
  const raw = arg(name);
  return raw === undefined ? undefined : (JSON.parse(raw) as StyleOverride);
};
const show = (label: string, value: unknown) =>
  console.log(`\n== ${label} ==\n${JSON.stringify(value, null, 2)}`);

if (has("help")) {
  console.log(HELP);
  process.exit(0);
}

const catalogId = arg("catalog") ?? "keyboard";
const catalog = getCatalog(catalogId);
if (!catalog) {
  console.error(`no such catalog: ${catalogId}`);
  process.exit(1);
}

if (has("list")) {
  for (const input of catalog.inputs) {
    const seed = seedBackgroundSource(input);
    console.log(
      `${input.id.padEnd(20)} ${input.label.padEnd(14)}` +
        `${catalog.defaultEnabled.includes(input.id) ? " [default]" : "         "}` +
        `${seed ? ` seed=${JSON.stringify(seed)}` : ""}`,
    );
  }
  process.exit(0);
}

// One Device, built from the catalog's Default Selection, with whatever overrides
// the flags asked for pushed onto the two override tiers.
const project: Project = createDefaultProject();
const device = createDeviceFromCatalog(catalog);
device.style = json("device") ?? {};
const glyphId = arg("glyph");
if (glyphId) {
  if (!device.enabled.includes(glyphId)) device.enabled.push(glyphId);
  device.glyphStyles[glyphId] = json("glyph-style") ?? {};
}
project.devices = [device];

console.log(
  `catalog=${catalog.id} inputs=${device.enabled.length} ` +
    `deviceOverride=${JSON.stringify(device.style)}`,
);

if (has("atlas")) {
  const [output] = generateTilesets(project);
  show("atlasSize", output.atlasSize);
  show("filename", output.filename);
  show(
    "placements",
    output.placements.map((p) => ({
      label: p.label,
      spriteName: p.spriteName,
      rect: p.rect,
      symbolId: p.symbolId,
      imageId: p.imageId,
    })),
  );
  show("metadata.meta", output.metadata.meta);
} else if (glyphId) {
  const entry = catalogIndex(catalog).get(glyphId);
  if (!entry) {
    console.error(`no such input in ${catalog.id}: ${glyphId} (try --list)`);
    process.exit(1);
  }
  show(`catalog entry: ${glyphId}`, entry);
  // The seed outranks the Device tier — a device-wide `source` no-ops on a seeded
  // Input, which is the cascade's least obvious rule (style.ts, ADR-0012 §2).
  show("catalog seed (background source)", seedBackgroundSource(entry) ?? null);
  show("project tier", project.style);
  show(
    "device tier resolved",
    resolveScopeStyle(project, { tier: "device", deviceIndex: 0 }),
  );
  show(
    "glyph tier resolved",
    resolveScopeStyle(project, { tier: "glyph", deviceIndex: 0, glyphId }),
  );
  const resolved = resolveDeviceInputs(device, project).find((i) => i.id === glyphId);
  show("resolveDeviceInputs entry (what the compositor draws)", resolved);
} else {
  show(
    "resolveDeviceInputs",
    resolveDeviceInputs(device, project).map((i) => ({
      id: i.id,
      label: i.label,
      symbolId: i.symbolId,
      imageId: i.imageId,
      backgroundSource: i.style.background.source,
      contentScale: i.style.contentScale,
      textColor: i.style.textColor,
    })),
  );
}

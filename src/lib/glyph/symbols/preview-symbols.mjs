// Dev preview: render every parsed Symbol from `symbols.generated.ts` into a
// standalone HTML gallery and open it, so the windowed viewBoxes, rotation twins,
// and colorization can be eyeballed. Run with `npm run symbols:preview` (which
// regenerates first). Not part of the app build; writes to the OS temp dir.
//
// Colorization preview: the authored art encodes three paint roles via the RGB
// sentinel palette (red → fill, blue → border, green → secondary; see
// paint-roles.mjs). The page classifies each shape by its authored *colour* and
// lets you remap the three roles live (colour + alpha), from the authored state.
// See README.md.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import {
  PAINT_ROLE_PALETTE,
  SENTINEL_HEX_BY_ROLE,
  normalizeHex,
  classifyPaint,
} from "./paint-roles.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GEN = join(HERE, "symbols.generated.ts");

const text = readFileSync(GEN, "utf8");
const assets = JSON.parse(
  text.match(/SYMBOL_ASSETS[^=]*=\s*(\[[\s\S]*?\]);/)[1],
);
const svgs = JSON.parse(text.match(/SYMBOL_SVGS[^=]*=\s*(\{[\s\S]*?\});/)[1]);

const cards = assets
  .map((a) => {
    const svg = svgs[a.id];
    const art = svg
      ? `<div class="art">${svg.replace("<svg", '<svg width="120" height="120"')}</div>`
      : `<div class="art missing">not authored</div>`;
    const meta = [
      a.kind,
      a.atlas && `atlas:${a.atlas}`,
      a.rotateOf && `↻${a.rotate}° of ${a.rotateOf}`,
    ]
      .filter(Boolean)
      .join(" · ");
    return `<figure><figcaption><code>${a.id}</code><small>${meta}</small></figcaption>${art}</figure>`;
  })
  .join("\n");

const authored = assets.filter((a) => svgs[a.id]).length;

// A role control = colour picker + alpha slider. Native <input type=color> has no
// alpha, so we pair it with a range and emit rgba().
const role = (id, label, color) => `
  <div class="role">
    <label>${label} <input type="color" id="${id}" value="${color}"></label>
    <input type="range" id="${id}A" min="0" max="100" value="100" title="alpha">
  </div>`;

const html = `<!doctype html><meta charset="utf8"><title>Symbol preview</title>
<style>
  body{font:14px system-ui;margin:24px;background:#0d1117;color:#c9d1d9}
  h1{font-size:16px}
  .toolbar{margin:12px 0;display:flex;gap:24px;align-items:center;flex-wrap:wrap}
  .role{display:flex;flex-direction:column;gap:4px}
  .role label{display:flex;gap:6px;align-items:center}
  .role input[type=range]{width:120px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px}
  figure{margin:0;border:1px solid #30363d;border-radius:8px;padding:12px;text-align:center;background:#161b22}
  figcaption{display:flex;flex-direction:column;gap:2px;margin-bottom:8px}
  code{color:#58a6ff}
  small{color:#8b949e;font-size:11px}
  .art{display:grid;place-items:center;height:130px;border-radius:6px;
    background:conic-gradient(#222 90deg,#2b2b2b 0 180deg,#222 0 270deg,#2b2b2b 0) 0 0/24px 24px}
  .missing{color:#f85149;font-style:italic;background:#161b22}
  button{align-self:center}
</style>
<h1>Parsed symbols — <span id="count"></span></h1>
<div class="toolbar">
  ${role("fill", "fill", SENTINEL_HEX_BY_ROLE.fill)}
  ${role("border", "border", SENTINEL_HEX_BY_ROLE.border)}
  ${role("secondary", "secondary", SENTINEL_HEX_BY_ROLE.secondary)}
  <div class="role"><label>card bg <input type="color" id="bg" value="#161b22"></label></div>
  <button id="reset">reset to authored</button>
</div>
<div class="grid" id="grid">${cards}</div>
<script>
  // Role classification is shared with the app (paint-roles.mjs), inlined here so
  // the gallery's browser script and the tool agree on the sentinel palette.
  const PAINT_ROLE_PALETTE = ${JSON.stringify(PAINT_ROLE_PALETTE)};
  const ROLE_BY_HEX = Object.fromEntries(
    PAINT_ROLE_PALETTE.map((p) => [p.hex, p.role]),
  );
  const normalizeHex = ${normalizeHex.toString()};
  const classifyPaint = ${classifyPaint.toString()};

  const shapeSel = "path,circle,ellipse,rect,line,polygon,polyline";

  // rgba() string from a #rrggbb picker + a 0..100 alpha slider.
  const rgba = (hex, pct) => {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return "rgba(" + r + "," + g + "," + b + "," + pct / 100 + ")";
  };

  // Read an authored paint ("fill"/"stroke") off an element: inline style wins,
  // then the presentation attribute; unspecified fill defaults to black.
  const paint = (el, prop) => {
    const style = el.getAttribute("style") || "";
    const m = new RegExp(prop + "\\\\s*:\\\\s*([^;]+)").exec(style);
    const v = (m ? m[1] : el.getAttribute(prop) || "").trim().toLowerCase();
    if (v) return v;
    return prop === "fill" ? "#000" : "none"; // SVG defaults
  };

  // Tag each shape with the roles it carries, from its authored sentinel colour.
  // A shape can carry a role on its fill and/or its stroke; non-sentinel colours
  // (the black art) and the invisible fill-opacity:0 bounding boxes stay unroled.
  const shapes = [...document.querySelectorAll(".art " + shapeSel)];
  for (const el of shapes) {
    const hiddenFill = paint(el, "fill-opacity") === "0";
    el.dataset.fillRole = hiddenFill ? "" : classifyPaint(paint(el, "fill")) || "";
    el.dataset.strokeRole = classifyPaint(paint(el, "stroke")) || "";
  }

  const recolor = () => {
    const paints = {
      fill: rgba(fill.value, fillA.value),
      secondary: rgba(secondary.value, secondaryA.value),
      border: rgba(border.value, borderA.value),
    };
    for (const el of shapes) {
      if (el.dataset.fillRole) el.style.fill = paints[el.dataset.fillRole];
      if (el.dataset.strokeRole) el.style.stroke = paints[el.dataset.strokeRole];
    }
  };

  const controls = [fill, fillA, border, borderA, secondary, secondaryA];
  for (const input of controls) input.oninput = recolor;
  bg.oninput = (e) =>
    document.querySelectorAll("figure").forEach((f) => (f.style.background = e.target.value));
  reset.onclick = () => {
    for (const el of shapes) {
      el.style.fill = "";
      el.style.stroke = "";
    }
    fill.value = ${JSON.stringify(SENTINEL_HEX_BY_ROLE.fill)};
    border.value = ${JSON.stringify(SENTINEL_HEX_BY_ROLE.border)};
    secondary.value = ${JSON.stringify(SENTINEL_HEX_BY_ROLE.secondary)};
    [fillA, borderA, secondaryA].forEach((a) => (a.value = 100));
  };
  recolor();
  count.textContent = ${authored} + " / " + ${assets.length} + " authored";
</script>`;

const out = join(tmpdir(), "uitoolbox-symbols-preview.html");
writeFileSync(out, html);
console.log(`Wrote ${out} (${authored}/${assets.length} authored). Opening…`);

const opener =
  process.platform === "win32"
    ? ["cmd", ["/c", "start", "", out]]
    : process.platform === "darwin"
      ? ["open", [out]]
      : ["xdg-open", [out]];
spawn(opener[0], opener[1], { detached: true, stdio: "ignore" }).unref();

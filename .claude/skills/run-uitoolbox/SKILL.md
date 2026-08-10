---
name: run-uitoolbox
description: Build, run, and drive UIToolbox and its Input Glyph Creator. Use when asked to start the app or dev server, run the unit or e2e tests, take a screenshot of the UI, inspect what the glyph Style Cascade resolves, or confirm a change works in the real running app.
---

UIToolbox is a client-side Next.js app; its one tool is the Input Glyph Creator
(`/tools/glyph-creator`), which turns a font plus a control list into sprite
atlases. There are **two harnesses**, and which you want depends on the layer you
changed:

- **`src/lib/glyph/**` (the DOM-free core — where most PRs land):**
  `.claude/skills/run-uitoolbox/inspect.ts`, run under `vite-node`. Imports the
  internals, calls them, prints what they resolve. No browser, no server.
- **UI, canvas drawing, persistence, export:**
  `.claude/skills/run-uitoolbox/driver.mjs` — a stdin REPL over Playwright that
  starts `next dev` itself, drives the editor, and takes screenshots.

All paths are relative to the repo root.

## Prerequisites

Node 24 (`.nvmrc` pins 24.18.0; `engines` requires `>=24.18.0`). No system
packages needed — verified on Windows 11 with Git Bash.

```bash
npm ci
npx playwright install chromium   # once, for driver.mjs and the e2e suite
```

`npm ci` in a **fresh git worktree** is not optional — worktrees get their own
empty `node_modules/`.

## Run (agent path)

### The glyph core, without a browser

```bash
npx vite-node -c vitest.config.ts .claude/skills/run-uitoolbox/inspect.ts -- --help
```

The `-c vitest.config.ts` is **required**: there is no `vite.config.ts` in this
repo, and that config is what carries `vite-tsconfig-paths`. Without it every
`@/lib/glyph/...` import fails to resolve.

| flags | what you get |
|---|---|
| `--catalog xbox --list` | every Input id, which are in the Default Selection, and the **Catalog seed** each projects |
| `--catalog xbox --glyph xbox-lb` | that Input's catalog entry, its seed, then the Project / Device / Glyph tiers resolved in order, then the `ResolvedInput` the compositor draws |
| `--device '<json>'` / `--glyph-style '<json>'` | push a `StyleOverride` onto the Device / Glyph tier, to watch precedence |
| `--atlas` | packed atlas size, sprite placements, TexturePacker `meta` |

Verified run — the cascade's least obvious rule, that **a Catalog seed outranks
the Device tier**:

```bash
npx vite-node -c vitest.config.ts .claude/skills/run-uitoolbox/inspect.ts -- \
  --catalog xbox --glyph xbox-lb \
  --device '{"background":{"source":{"kind":"shape"},"fill":"#123456"}}'
```

The Device asked for `source: shape` *and* `fill: #123456`. In the resolved Glyph
tier the fill lands (`#123456`) but the source does **not** — it stays
`{authored, bumper, flipX: true}` from the seed. A device-wide source no-ops on
the seeded shoulder Inputs; anything else at that tier still applies. `--list`
shows which Inputs carry a seed at all.

`inspect.ts` is agent tooling: edit it, add whatever you need to print.

### The running app

```bash
printf 'preview\nss home\nquit\n' | node .claude/skills/run-uitoolbox/driver.mjs
```

One command per line on stdin; every reply starts with `ok` or `err`, so pipes,
heredocs, and `tmux send-keys` all work. It starts `next dev` on **port 3100**
(not 3000 — the Playwright e2e suite owns 3000, so the two never collide), waits
for the atlas canvas, then reads stdin. Screenshots and downloads land in
`.claude/skills/run-uitoolbox/shots/` (git-ignored).

| command | what it does |
|---|---|
| `goto [path]` | navigate; defaults to `/tools/glyph-creator` |
| `ss [name]` | full-page screenshot → `shots/<name>.png` |
| `preview` | canvas size + a hash of its pixels — **compare across steps to prove a redraw** |
| `pick [nth]` | click the nth atlas cell, opening the Glyph editor popover |
| `controls [filter]` | role + accessible name + value of every visible control |
| `font` / `image` | upload `e2e/fixtures/test-font.ttf` / `test-image.svg` |
| `device <name>` | check a Device checkbox, e.g. `device Xbox` |
| `set <name> = <value>` | set the field matching `<name>` — handles both typed inputs and sliders |
| `click <name>` | click the button matching `<name>` |
| `export` | run the Export flow, print the bundle's entries and sizes |
| `eval <js>` | `page.evaluate` and print the JSON result |
| `console` | console messages + page errors seen so far |

**Start with `controls`.** Field names change between releases, and it prints the
exact accessible names `set` and `click` match against.

A verified end-to-end flow — put an image on a Glyph, scale its content, export,
and confirm every step actually redrew:

```bash
printf 'pick 0\npreview\nimage\npreview\nset Content scale = 1.5\npreview\nss main-flow\nexport\nquit\n' \
  | node .claude/skills/run-uitoolbox/driver.mjs
```

The three `preview` hashes came back all different (`ad9311066657` →
`bc57af68b66f` → `44fb6fd11689`); `controls scale` then showed
`Content scale (150%)` plus a new *"Reset Content scale to inherited"* button
(proof the edit registered as a Glyph-tier override, not just a moved slider); and
`export` produced `keyboard_atlas.png` (77KB) + `keyboard_atlas.json`.
Rasterization is asynchronous, so a hash that hasn't moved may just be early — run
`preview` again before concluding nothing happened.

Set `HEADED=1` to watch a real window, `PORT=…` to move off 3100.

## Run (human path)

```bash
npm run dev        # http://localhost:3000 — Ctrl-C to stop
npm run storybook  # component workshop on :6006
```

## Test

```bash
npm run typecheck   # clean
npm run lint        # clean
npm run test        # vitest — 27 files, 380 tests pass, ~13s
npm run test:e2e    # production build, then Playwright + axe on :3000
```

`test:e2e` runs `next build` first via `pretest:e2e`, so it is minutes, not
seconds.

**If something else already owns port 3000** — a dev server you didn't start, a
sibling worktree — `test:e2e` dies with `EADDRINUSE` before running a single test,
and you should not go killing a process you don't own. Use the alt-port config
instead; it moves the port and changes nothing else:

```bash
npm run build
npx playwright test --config .claude/skills/run-uitoolbox/playwright.alt-port.config.ts
```

Verified: 14 tests pass in ~13s on port 3200 (`E2E_PORT` overrides). The explicit
`npm run build` is required — this config bypasses the `pretest:e2e` hook.

## Gotchas

- **Nothing in `.claude/` is validated by the repo's gates.** `.prettierignore`
  excludes the directory outright, and TypeScript's `**/*.ts` wildcard *skips
  dot-directories*, so `tsconfig.json` never sees these files either — confirm
  with `npx tsc --noEmit --listFiles | grep skills` (zero hits). A broken
  `inspect.ts` therefore passes `npm run typecheck` silently. **Run it to check
  it**; don't trust a green typecheck. (Type-checking it standalone is not a
  substitute — `npx tsc inspect.ts` can't resolve `@/` without the project config.)
- **Sliders can't be `fill`ed, and `el.value = v` doesn't reach React.** Several
  style controls are `range` inputs. `driver.mjs`'s `set` drives them through the
  native `value` setter plus a bubbling `input` event, which is what React's
  synthetic `onChange` listens for; assigning `.value` alone updates the DOM and
  the app never hears about it.
- **Never `waitUntil: "networkidle"` against `next dev`.** The HMR websocket stays
  open for the life of the page, so networkidle never fires and the goto times out
  at 30s. `driver.mjs` waits for the atlas canvas instead. (Cost me a run.)
- **Most editor controls exist twice** — once in the sidebar at Project/Device
  scope, once in the open Glyph editor popover, with the *same* accessible name.
  `driver.mjs` scopes `set` and `click` to the popover whenever one is open; a raw
  Playwright locator needs `.getByRole("region", { name: /edit glyph/i })` or it
  hits the wrong twin.
- **`npm run dev` is a shell wrapper, so killing its pid orphans the real
  `next dev`** and the next run dies with `EADDRINUSE`. `driver.mjs` kills the
  whole tree with `taskkill /T /F` before exit, and reuses an already-listening
  server if it finds one. Reuse is safe for `dev` only — `playwright.config.ts`
  deliberately refuses to reuse `npm run start`, because a leftover server there
  would serve the *previous* build.
- **`driver.mjs` invalidates the production build.** `next dev` and `next build`
  share `.next/`, so once the driver has run, `npm run start` (and therefore the
  e2e suite) crashes with `Cannot find module './vendor-chunks/@swc.js'` and the
  webServer times out after 120s. Always `npm run build` again between driving the
  app and running e2e. This bites hardest with the alt-port config, which has no
  build hook of its own.
- **`npm run typecheck` is incremental and will lie after a branch switch.**
  `tsconfig.tsbuildinfo` is committed-adjacent state; it reported clean against
  code that no longer existed. `rm -f tsconfig.tsbuildinfo` before trusting it
  across a checkout.
- **`npm ci` warns that install scripts were skipped** (`esbuild`, `sharp`,
  `unrs-resolver`) under this machine's allow-scripts policy. Harmless in
  practice: vitest, vite-node, `next build`, and Playwright all worked anyway.
- **The Glyph editor popover is taller than the viewport** at 1600×1000 and
  scrolls internally — `ss` shows it clipped even with `fullPage`. Use `controls`
  to read fields you can't see rather than trusting the image.
- **Adding a Device doesn't change the preview.** The canvas shows one Device at a
  time, so `device Xbox` leaves the pixel hash identical — correct, not a failed
  click. The new Device shows up in `export`.

## Troubleshooting

- **`page.goto: Timeout 30000ms exceeded … waiting until "networkidle"`**: see the
  networkidle gotcha above.
- **`TypeError: … is not a function` from `inspect.ts`**: it references a core
  export that has been renamed. Nothing type-checks this file (first gotcha) —
  `grep -n "^export" src/lib/glyph/generate.ts` and fix the import.
- **Port 3100 already listening after an aborted run**: kill the orphan —
  `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3100 -State Listen | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force }"`.
  Or just start the driver anyway; it reuses a live dev server.
- **`Cannot find module '@/lib/glyph/generate'` from `inspect.ts`**: you dropped
  `-c vitest.config.ts`.
- **`Cannot find module './vendor-chunks/@swc.js'` from `npm run start`**: the
  driver's `next dev` overwrote `.next/`. Re-run `npm run build`.
- **`EADDRINUSE :3000` from `npm run test:e2e`**: something you may not own is on
  3000. Use the alt-port config above rather than killing it.
- **`Error: Cannot find module 'next'` / empty `node_modules`**: fresh worktree,
  run `npm ci`.
- **Next warns `We detected multiple lockfiles`** and picks the main checkout's
  root. Expected inside a worktree; the app still builds and serves correctly.

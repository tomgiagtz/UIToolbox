# UIToolbox

Browser-based tools for game developers. The first tool is the **Input Glyph
Creator** — turn a font and a list of controls into engine-ready sprite atlases
of input prompts. Everything runs client-side; nothing is uploaded to a server.

See [`CONTEXT.md`](./CONTEXT.md) for the domain glossary and
[`docs/adr/`](./docs/adr) for the architecture decisions.

## Stack

- **Next.js** (App Router) + **TypeScript** — see [ADR-0001](./docs/adr/0001-web-stack.md)
- **Tailwind CSS v4** + **shadcn/ui** (Radix primitives)
- **Storybook** — component workshop
- **Vitest** — unit / component tests
- **Playwright** + **axe** — e2e and WCAG 2.1 AA accessibility checks

## Getting started

```bash
npm install
npx playwright install chromium   # once, for e2e tests
npm run dev                        # http://localhost:3000
```

The home page links to the Input Glyph Creator at `/tools/glyph-creator`.

## Scripts

| Script                    | What it does                              |
| ------------------------- | ----------------------------------------- |
| `npm run dev`             | Start the dev server                      |
| `npm run build`           | Production build                          |
| `npm run start`           | Serve the production build                |
| `npm run typecheck`       | `tsc --noEmit`                            |
| `npm run lint`            | ESLint                                    |
| `npm run test`            | Vitest (unit / component)                 |
| `npm run test:e2e`        | Playwright e2e + axe a11y (needs a build) |
| `npm run storybook`       | Storybook dev server on port 6006         |
| `npm run build-storybook` | Static Storybook build                    |

## Testing seams

Two seams, established here for every later tool to reuse (see the spec's
Testing Decisions):

- **Vitest** — pure logic and component tests, no browser. The Input Glyph
  Creator's core will be exercised through `generateTilesets(project)`.
- **Playwright + axe** — real-browser behavior the pure seam can't reach
  (downloads, canvas output, WCAG 2.1 AA). The axe helper lives in
  [`e2e/axe.ts`](./e2e/axe.ts).

## CI

GitHub Actions ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) runs
typecheck, lint, Vitest, the production build, Storybook build, and Playwright
e2e on every push and PR to `main`.

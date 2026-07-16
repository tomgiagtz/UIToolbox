# ADR-0001: Web stack

- **Status:** Accepted
- **Date:** 2026-07-16
- **Context ticket:** #1 (Spec: Input Glyph Creator), #2 (Repo scaffold)

## Context

UIToolbox is a collection of browser-based tools for game developers, starting
with the Input Glyph Creator. The tool's core — rendering Glyphs and generating
Sprite Atlases — runs **entirely in the browser**: the user's fonts and settings
must stay local, with no account and no server-side generation (spec user story
25). We need a stack that:

- ships a fast, deployable static/SSR web app,
- gives us accessible UI primitives so the interface can meet WCAG 2.1 AA,
- supports a shared component library previewable in isolation, and
- has strong testing seams for pure logic and real-browser behavior (incl. a11y).

The tool is also the "tracer bullet" that establishes the shell later tools
inherit, so the stack choices set precedent.

## Decision

- **Framework:** **Next.js (App Router) + TypeScript**, deployed on Vercel. The
  tool's core is fully client-side — no API routes are used for generation.
- **Styling / UI:** **Tailwind CSS** + **shadcn/ui**, which vends accessible
  **Radix** primitives we own in-repo (not a black-box component dependency).
- **Component workshop:** **Storybook** for the shared UI primitives and, later,
  `GlyphPreview` — visual review across Background shape / border / color
  variants.
- **Testing:** **Vitest** for unit/component tests (the pure `generateTilesets`
  seam runs with no DOM); **Playwright** for e2e in a real browser, with
  **axe** (`@axe-core/playwright`) wired into the harness so tickets can assert
  WCAG 2.1 AA.
- **CI:** **GitHub Actions** running typecheck + lint + `vitest run` +
  `playwright test` on the default branch.

## Consequences

- No backend to secure or scale; privacy (local-only fonts/settings) falls out
  of the client-side decision for free.
- Owning the shadcn/Radix components in-repo means we can meet a11y requirements
  and restyle without fighting a dependency.
- Two clear test seams (pure Vitest + real-browser Playwright/axe) are
  established up front for every later tool to reuse.
- Vercel/Next App Router is a mainstream, low-surprise path; the trade-off is
  buying into the Next build model over a lighter SPA bundler.

## Scope guard

The walking skeleton establishes **just enough shell to host one tool**. Do
**not** build a plugin/multi-tool architecture yet — generalize when tool #2
arrives (spec "Further Notes").

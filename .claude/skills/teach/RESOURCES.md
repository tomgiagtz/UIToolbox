# UIToolbox Learning — Resources

Curated, high-trust sources, grouped by learning thread. Knowledge for lessons is
drawn from here, not from parametric guesses.

---

# Rendering (Next.js) — active thread

## Knowledge

- [Rendering on the Web — web.dev (Jason Miller & Addy Osmani)](https://web.dev/articles/rendering-on-the-web)
  The canonical taxonomy of CSR / SSR / static rendering / hydration, framework-agnostic. **Primary source for this thread.** Use for: the mental model of _when_ HTML is built and _where_ the app runs.
- [Server and Client Components — Next.js Docs](https://nextjs.org/docs/app/getting-started/server-and-client-components)
  How the App Router splits the tree; why layouts/pages are Server Components by default and how `"use client"` marks the boundary. Use for: deciding where the client boundary goes around the glyph generator.
- [`use client` directive — Next.js Docs](https://nextjs.org/docs/app/api-reference/directives/use-client)
  Exact semantics of the boundary directive. Use for: what actually ships to the browser once you add it.
- [Static Exports (`output: 'export'`) — Next.js Docs](https://nextjs.org/docs/app/guides/static-exports)
  How Next prerenders every route to static files in `out/`, and what that mode does and doesn't support. Use for: judging whether UIToolbox should drop its Node server entirely.
- [`hydrateRoot` — React Docs](https://react.dev/reference/react-dom/client/hydrateRoot)
  What hydration _is_ at the API level, and the "output must match the server" rule that causes hydration mismatches. Use for: understanding what goes wrong when prerendered HTML and browser render disagree.

## Wisdom (Communities)

- [Next.js GitHub Discussions](https://github.com/vercel/next.js/discussions)
  Maintainer-frequented. Use for: "is this the intended way to do a client-only app on the App Router" questions grounded in real configs.
- [r/nextjs](https://reddit.com/r/nextjs)
  High-volume Q&A. Use for: `"use client"` boundary and static-export gotchas others have already hit.

## Gaps
- No single source yet that walks a _fully client-only_ Next.js App Router app end
  to end (most tutorials assume server data). Currently bridged by lessons grounded
  in UIToolbox itself; find one if it exists.

---

# Continuous Integration (GitHub Actions) — paused thread

## Knowledge

- [Understanding GitHub Actions — GitHub Docs](https://docs.github.com/en/actions/get-started/understanding-github-actions)
  The canonical primary source. Defines the five components (workflows, events, jobs, actions, runners) in GitHub's own words. Use for: the core vocabulary and mental model.
- [About workflows — GitHub Docs](https://docs.github.com/en/actions/concepts/workflows-and-actions/about-workflows)
  How workflows are structured and triggered; jobs-on-runners, steps-in-jobs. Use for: reading a workflow file top to bottom.
- [Workflow syntax for GitHub Actions — GitHub Docs](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
  Exhaustive reference for every key (`on`, `jobs`, `steps`, `uses`, `run`, `needs`, `if`, …). Use for: looking up what a specific line in a YAML file means.
- [Martin Fowler — "Continuous Integration"](https://martinfowler.com/articles/continuousIntegration.html)
  The foundational essay on _why_ CI exists (the practice, not the tool). Use for: understanding what "green means safe to merge" is really promising, and what it isn't.

## Wisdom (Communities)

- [GitHub Community — Actions & Packages](https://github.com/orgs/community/discussions/categories/actions-and-packages)
  Official discussion space; GitHub staff and power users. Use for: "why did my workflow do X" questions grounded in real runs.
- [Stack Overflow — `github-actions` tag](https://stackoverflow.com/questions/tagged/github-actions)
  High-volume, high-signal Q&A. Use for: specific error messages and syntax puzzles.

## Gaps
- No resource yet specifically on _reading a run's UI_ (the checks list, expanding jobs, finding the first red step). Currently taught directly in lessons; find a good visual walkthrough if one exists.

# UIToolbox Learning — Glossary

Canonical language for this workspace, grouped by learning thread. All lessons,
exercises, and learning records adhere to these terms.

## Continuous Integration (GitHub Actions)

The vocabulary for reading a GitHub Actions CI pipeline and judging whether a green
run means "safe to merge." Terms use GitHub's own wording where it exists.

**Continuous Integration (CI)**:
The practice of merging work frequently and having an automated build verify each
change, so problems surface early. GitHub Actions is one _tool_ for it.
_Avoid_: "the build", "the pipeline" (those are parts, not the practice)

**Workflow**:
A configurable automated process that runs one or more jobs, defined in a YAML file
under `.github/workflows/`.
_Avoid_: "the action", "the script", "the CI file"

**Event (trigger)**:
A specific activity in a repository that starts a workflow run — e.g. a push or a
pull request. Declared under the `on:` key.
_Avoid_: "the hook"

**Job**:
A set of steps that execute on the same runner. Jobs run in parallel by default;
one job can wait for another with `needs:`.
_Avoid_: "task", "stage"

**Step**:
A single unit inside a job that either runs a script (`run:`) or invokes an action
(`uses:`). Steps run in order, top to bottom.
_Avoid_: "command" (a step may be more than one command), "line"

**Action**:
A reusable, pre-packaged unit of work invoked by a step with `uses:` — e.g.
`actions/checkout@v4`.
_Avoid_: "plugin", "package"

**Runner**:
The server that executes a job when triggered — e.g. `ubuntu-latest`.
_Avoid_: "machine", "container", "the CI server"

**Green / Red (a check)**:
Green = every step in the run exited successfully (exit code 0). Red = at least one
step failed. A check reports back onto the pull request.
_Avoid_: "passing/failing" used loosely — tie it to exit status

**Gate**:
A step whose failure blocks the run (and, by policy, the merge). The set of gates is
exactly what a green tick is vouching for — no more.
_Avoid_: "test" (a gate may be a lint or typecheck, not a test)

## Rendering (Next.js)

The vocabulary for saying, of any route, _when_ its HTML is built and _where_ the
app runs afterward. In this workspace "render" always means "turn components into
HTML"; the open questions are always _when_ and _where_.

**Render strategy**:
The answer to two questions about a route: _when_ its first HTML is produced
(at build, per request, or in the browser) and _where_ the app runs after that.
CSR, SSR, and prerender are the three answers.
_Avoid_: "SSR" as a catch-all for "anything that touches a server"

**CSR (client-side rendering)**:
Ship near-empty HTML plus a JS bundle; the browser builds the whole UI. The app
runs entirely in the browser, but first paint waits for JS.
_Avoid_: "SPA" used as if it were a rendering strategy (an SPA is an app shape)

**SSR (server-side rendering)**:
Build a route's HTML _per request, on a live server, at the moment it is asked
for._ Requires a running server at runtime.
_Avoid_: "server rendering" used loosely — reserve SSR for the _per-request_ case

**Prerender (SSG)**:
Build a route's HTML _once, at build time._ The output is static files a CDN — or
`file://` — can serve with no server at runtime. This is what UIToolbox wants.
_Avoid_: "SSR" (prerender renders on the server too, but at _build_ time, not per
request); "SSG" alone when you mean the act rather than the whole-site pattern

**Server Component**:
The App Router default: a component that runs at build (or on the server) and ships
no JavaScript to the browser. Renders static HTML; cannot use state, effects, or
browser APIs. In UIToolbox, `page.tsx` and `layout.tsx`.
_Avoid_: "SSR component" — it's about _where it runs_, not per-request rendering

**Client Component**:
A component below a client boundary (`"use client"`). Prerendered once at build like
any other, then hydrated and interactive in the browser. The only place state,
effects, and browser APIs may be used. In UIToolbox, `glyph-creator.tsx`.
_Avoid_: "browser-only component" — its _first render_ still happens at build

**Hydration**:
The browser attaching React's event listeners and state to already-rendered HTML,
turning a static prerendered page into a live app without rebuilding the DOM.
_Avoid_: "loading", "mounting" (mounting builds new DOM; hydration adopts existing DOM)

**Client boundary (`"use client"`)**:
The directive marking where a component tree switches from server/prerender to the
browser. Everything imported below it ships to and runs in the browser — this is
where code using `window`, `localStorage`, `IndexedDB`, or canvas must live.
_Avoid_: "client component" as if it never touches the server — it is still
prerendered once at build unless opted out

**Static export (`output: 'export'`)**:
A Next.js build mode that writes an HTML file per route into `out/` and needs no
Node server to serve them — the fully-static form of prerender.
_Avoid_: confusing it with `next start`, which serves a build from a running Node
server even when every route is prerendered

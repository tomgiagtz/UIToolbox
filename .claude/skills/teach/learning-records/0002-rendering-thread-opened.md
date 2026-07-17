# Rendering thread opened; CI paused

On 2026-07-17 Tom asked about server-side rendering, framed by a genuinely sharp
misconception-in-tension: "it seems weird to server-side render an app that should
run offline." He chose to open this as a **new learning thread** rather than a
one-off, so the workspace's active mission moved from CI to **the Next.js rendering
model** (see [[MISSION.md]]). The CI thread is paused, not abandoned —
`archive/mission-ci.md`, one lesson done, no mastery shown.

**Prior knowledge established:** reads React/TSX and App Router files comfortably;
understood the CSR/SSR/prerender distinction immediately once "server rendering" was
split into _when is HTML built_ + _where does the app run_. So: teach the
_judgement_ (which strategy fits, where the client boundary goes), not React or JSX
basics.

**The productive misconception (high-value, predicts future stumbles):** he
conflated "renders on a server" with "needs a server at runtime." The resolution —
prerender renders on the server at _build_ time, leaving static files — is the
keystone of this thread. Watch for the same conflation resurfacing around
`output: 'export'` vs `next start`, and around Server Components ("server" in the
name, but they run at build for a static route).

**Grounding fact for future lessons:** `next.config` is still empty (so `next start`
still serves prerendered pages — that half stands). But the "zero `"use client"`
files" claim is **now stale**: the Input Glyph Creator tracer bullet has landed
(commit `5793a05`) with a real, clean client boundary — `page.tsx` (Server
Component) → `glyph-creator.tsx` (`"use client"`) → `glyph-preview.tsx` (canvas in a
`useEffect`), over pure `src/lib/glyph/*` logic. Lesson `0003-drawing-the-client-boundary.html`
teaches from that real code, not a hypothetical.

No mastery demonstrated yet — lesson `0002-where-does-my-app-render.html` delivered
the model and the map. Reassess after the retrieval quiz or his next question.

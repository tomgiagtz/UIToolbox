# Mission: Where my app renders (the Next.js rendering model)

## Why
Tom builds client-only, offline-capable tools (UIToolbox) on Next.js — a framework
whose defaults assume a server. He wants to look at his _own_ app and know which
rendering strategy each route uses, so he can place the client boundary
deliberately instead of cargo-culting `"use client"`, keep the user's fonts off any
server for real, and trust that "it built" means "it runs the way I intend, in the
browser."

## Success looks like
- For any route, can name whether it is CSR / SSR / build-time prerender — and say
  _when_ its HTML is built and _where_ the app runs afterward.
- Can explain, unprompted, why UIToolbox wants build-time prerender + a browser
  runtime rather than per-request SSR.
- Can predict which code breaks the prerender (browser-only APIs) and where the
  `"use client"` boundary must sit around the glyph generator.
- Can decide whether UIToolbox should add `output: 'export'`, and articulate the
  trade-off between `next start` (a Node server) and a static export.

## Constraints
- Comfortable reading React/TSX and App Router files; has not yet built an
  interactive client component in this project (no `"use client"` files exist yet).
- Prefers his live UIToolbox repo over toy examples. Short lessons, one win each.

## Out of scope (for now)
- Data fetching / caching / streaming / RSC payloads in depth — UIToolbox fetches
  nothing from anywhere.
- Server Actions, middleware, the edge runtime.
- PWA / service-worker offline mechanics and hydration performance tuning — a later
  thread once the render-time model is solid.

---

_Paused thread: **Continuous Integration** (1 lesson in) lives in
`archive/mission-ci.md`; its glossary and resources remain in `GLOSSARY.md` /
`RESOURCES.md` under the "Continuous Integration" heading. Resume by copying the
archive back over this file._

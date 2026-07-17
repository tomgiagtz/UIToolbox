# Notes

## Workspace structure — two threads
This workspace now carries two learning threads. Only one is **active** in
`MISSION.md` at a time (the format wants one mission per workspace).

- **Active: Rendering (Next.js)** — mission in `MISSION.md`.
- **Paused: Continuous Integration** — mission archived in `archive/mission-ci.md`.

Shared reference files hold both threads, grouped under topic headings:
- `GLOSSARY.md` → "Continuous Integration" + "Rendering (Next.js)" sections.
- `RESOURCES.md` → a section per thread.
Lessons and learning-records are numbered sequentially across both threads
(0001 = CI, 0002 = Rendering). To resume CI, copy the archive back over `MISSION.md`.

## Teaching preferences observed
- Wants to **understand the machinery of his own stack well enough to judge it**,
  not cargo-cult it — the through-line behind both threads. Ground lessons in the
  live UIToolbox repo, not toy examples.
- Asks sharp "wait, that seems wrong" questions. Lead with the misconception, then
  resolve it — that framing lands well with him.
- Short lessons, one tangible win each.

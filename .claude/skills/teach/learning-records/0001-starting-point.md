# Starting point: reads YAML roughly, goal is "read & trust" CI

Tom came in with **some exposure** to GitHub Actions — can roughly follow a
workflow YAML file, has used CI others set up, but can't yet confidently write or
debug one. His stated mission is narrow and concrete: look at a CI run (or its
workflow file) and know what it does and whether **green means safe to merge**.

Implications for future sessions:
- Skip YAML-syntax basics; he can read it. Teach the _model_ (event → workflow →
  job → runner → step) and _judgement_ (trust = gate coverage), not syntax.
- Authoring workflows and debugging red builds are explicitly **out of scope for
  now** — deferred until "read & trust" is fluent. The mission may extend to them
  later; confirm before widening.
- Ground everything in his live UIToolbox repo (PR #8, `ci.yml`) — he prefers real
  runs over toy examples.

Lesson 1 (`0001-reading-a-ci-run.html`) covered the five-word model, decoded his
actual `verify` job, and introduced "green = declared gates passed, nothing more."
No demonstrated mastery yet — reassess after he completes the retrieval quiz or
brings questions.

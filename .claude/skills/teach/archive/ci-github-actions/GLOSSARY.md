# Continuous Integration (GitHub Actions) Glossary

The vocabulary for reading a GitHub Actions CI pipeline and judging whether a green
run means "safe to merge." Terms use GitHub's own wording where it exists.

## Terms

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

<!-- PAUSED 2026-07-17. This thread is on hold, not finished — 1 lesson done
     (lessons/0001-reading-a-ci-run.html), no mastery demonstrated yet. The active
     mission moved to rendering (see ../MISSION.md and learning-records/0002).
     Its glossary/resources still live in ../GLOSSARY.md and ../RESOURCES.md under
     the "Continuous Integration" heading. To resume, copy this back over MISSION.md. -->

# Mission: Continuous Integration (GitHub Actions)

## Why
Tom ships projects like UIToolbox where a CI pipeline gates every pull request. He
wants to look at a CI run — or the workflow file behind it — and _know_ what it is
doing and whether a green check actually means "safe to merge," rather than
trusting the tick blindly.

## Success looks like
- Given a CI run on a PR, can name what triggered it, what job(s) ran, and what each step checked.
- Can read a workflow YAML file and predict what will run and when.
- Can judge whether "green" is trustworthy for a given change — i.e. whether the gates cover what could break.
- Can spot the difference between a failing check, a passing check with warnings, and a check that never ran.

## Constraints
- Comfortable roughly reading YAML; not yet confident writing or debugging a workflow.
- Prefers learning grounded in his own live repos (UIToolbox) over toy examples.
- Short lessons — one tangible win each.

## Out of scope (for now)
- Authoring workflows from scratch (a later phase — mission may extend once "read & trust" is solid).
- Debugging red builds as a dedicated skill (comes after reading fluency).
- Non-GitHub CI systems (GitLab CI, CircleCI, Jenkins).
- Deployment / CD (this mission is the _integration_ half only).

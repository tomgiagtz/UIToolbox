# Continuous Integration (GitHub Actions) Resources

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

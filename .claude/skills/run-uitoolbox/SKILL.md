---
name: run-uitoolbox
description: Run, start, launch, or screenshot the UIToolbox Next.js dev server. Use when asked to run the app, see a change in the real UI, or capture a screenshot of a page such as the Glyph Creator.
---

# Run UIToolbox

Next.js 15 app. `npm run dev` picks its own port, so **never hardcode 3000** —
read the port out of the log. Paths below are relative to the repo root (or to a
worktree root — same commands).

## Prerequisites

Node >= 24.18.0 and `npm install` already run. Nothing else. Screenshots use the
Playwright that is already a devDependency; no extra browser install was needed.

## Run

`next dev` never exits, so background it and capture the log:

```bash
rm -f dev.log && npm run dev > dev.log 2>&1 &
```

Wait for readiness, then read the port it actually chose:

```bash
until grep -qE 'Ready in|Error' dev.log; do sleep 1; done
URL=$(grep -oE 'http://localhost:[0-9]+' dev.log | head -1)
echo "$URL"
```

Smoke-test it:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$URL/tools/glyph-creator"
```

Routes: `/` and `/tools/glyph-creator`.

## Screenshot

```bash
npx playwright screenshot --viewport-size=1280,900 --wait-for-timeout=2000 \
  "$URL/tools/glyph-creator" shot.png
```

Then **look at `shot.png`** with the Read tool. The Glyph Creator SSRs an Editor
panel on the left and a rendered glyph grid on the right; a blank right-hand
panel means the client render failed even though curl returned 200.

`--wait-for-timeout=2000` is load-bearing — the glyph grid is drawn client-side
after fonts resolve, and without the wait you capture an empty preview pane.

## Stop

`kill %1` is **not** enough on Windows — it reaps the `npm` wrapper and leaves
the `next-server` child listening. `pkill -f next-server` from Git Bash does not
reach it either. Kill by port:

```powershell
$pids = 3000..3005 | ForEach-Object { try { (Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction Stop).OwningProcess } catch {} } | Sort-Object -Unique
$pids | ForEach-Object { Stop-Process -Id $_ -Force }
```

Verify: `curl -s -o /dev/null -m 2 -w "%{http_code}\n" http://localhost:3000`
returns `000` when nothing is listening.

`dev.log` and `shot.png` at the repo root are gitignored — leave them, or delete
them, either is fine.

## Gotchas

- **Orphaned dev servers hold ports.** Next logs `Port 3000 is in use by process
  NNNNN, using available port 3002 instead` and carries on, so consecutive runs
  creep up the port range. The culprit is almost always a `next-server` from an
  earlier session that outlived its parent shell (see Stop). This is why every
  command above goes through `$URL` rather than a literal port.
- **Worktrees log a lockfile warning.** Running from
  `.claude/worktrees/<name>/` prints `Warning: Next.js inferred your workspace
  root` and picks the *main* checkout's `package-lock.json` for output tracing.
  Harmless for dev browsing; it does not mean you are serving main's code.
- **Worktree directory names go stale.** They are named after the issue they
  were created for and are not renamed when the branch moves on. Confirm with
  `git -C <worktree> log --oneline -1` before trusting the folder name.
- `$TMPDIR` is empty in Git Bash here, so `-o "$TMPDIR/x.html"` silently
  resolves to `/x.html` and fails. Use an explicit path.

## Test

```bash
npm test          # vitest
npm run typecheck # tsc --noEmit
```

`npm run test:e2e` triggers a full `next build` first (`pretest:e2e`) — slow, and
not needed to eyeball a UI change.

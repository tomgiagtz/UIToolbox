#!/usr/bin/env node
// PostToolUse hook: runs `prettier --write` on the file Claude Code just edited.
// Reads the hook payload as JSON on stdin, extracts the edited file path, and
// formats it in place using the project's own Prettier. Silent + non-blocking:
// any failure (parse error, non-JS file, Prettier missing) is swallowed so the
// hook never interrupts the edit.
let data = "";
process.stdin.on("data", (chunk) => (data += chunk));
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(data);
    const file =
      (payload.tool_response && payload.tool_response.filePath) ||
      (payload.tool_input && payload.tool_input.file_path);
    if (!file) return;
    const prettierBin = require.resolve("prettier/bin/prettier.cjs");
    // --ignore-unknown skips files Prettier can't parse; .prettierignore is respected.
    require("child_process").spawnSync(
      process.execPath,
      [prettierBin, "--write", "--ignore-unknown", file],
      { stdio: "inherit" },
    );
  } catch {
    // Never let a formatting hiccup block the edit.
  }
});

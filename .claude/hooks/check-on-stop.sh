#!/usr/bin/env bash
# Claude Code Stop hook: runs `npm run check` and, if it fails, blocks the
# session from ending (exit 2) and hands the failure output back to Claude.
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
[ -d node_modules ] || exit 0   # not installed yet; nothing to check

if out=$(npm run --silent check 2>&1); then
  exit 0
fi

{
  echo "npm run check failed. Fix it before finishing."
  echo "$out" | grep -vE 'DeprecationWarning|trace-deprecation' | tail -60
} >&2
exit 2

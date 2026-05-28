#!/usr/bin/env bash
# =========================================================================
# push.sh — one-shot "save my work" script.
# Runs:  git add .  →  git commit -m "<msg>"  →  git push
#
# Usage:
#   ./push.sh                  ← uses default message "update"
#   ./push.sh "fix typo"       ← uses the supplied message instead
#
# Notes:
#   • If there is nothing to commit (no changes), it skips commit + push
#     instead of failing.
#   • set -e makes the whole script abort if any single step errors out,
#     so you don't accidentally push broken state.
# =========================================================================

set -e

# Use the first CLI arg as the commit message; fall back to "update" if
# none was supplied. The :- syntax is Bash's "default value" operator.
MSG="${1:-update}"

# Make sure we're inside a git repo before doing anything destructive
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo "❌ Not a git repository. Run 'git init' first."
  exit 1
fi

echo "→ Staging changes…"
git add .

# git diff --cached --quiet returns 0 if there's nothing staged, 1 if there is.
# We invert that with ! so the if-branch runs when there ARE changes.
if ! git diff --cached --quiet; then
  echo "→ Committing with message: \"$MSG\""
  git commit -m "$MSG"

  echo "→ Pushing to remote…"
  git push

  echo "✅ Done. Pushed to: $(git remote get-url origin)"
else
  echo "ℹ️  Nothing to commit. Working tree is clean."
fi

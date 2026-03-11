#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(git -C "$ROOT" rev-parse --show-toplevel)"
REMOTE_REF="${1:-origin/main}"
BRANCH_NAME="${2:-codex/mc-upstream-sync}"
WORKTREE_PATH="${3:-/private/tmp/mc-upstream-sync}"

git -C "$REPO_ROOT" fetch origin

if git -C "$REPO_ROOT" worktree list | awk '{print $1}' | grep -qx "$WORKTREE_PATH"; then
  echo "Worktree already exists at $WORKTREE_PATH"
else
  if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
    git -C "$REPO_ROOT" worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
  else
    git -C "$REPO_ROOT" worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" "$REMOTE_REF"
  fi
fi

if [[ -f "$ROOT/.env.local" && ! -f "$WORKTREE_PATH/.env.local" ]]; then
  cp "$ROOT/.env.local" "$WORKTREE_PATH/.env.local"
fi

cat <<EOF
Prepared Mission Control upstream-sync worktree
  repo:      $REPO_ROOT
  remote:    $REMOTE_REF
  branch:    $BRANCH_NAME
  worktree:  $WORKTREE_PATH

Next steps:
  1. cd "$WORKTREE_PATH"
  2. pnpm install --frozen-lockfile
  3. pnpm sync:report
  4. PORT=3015 pnpm dev
EOF

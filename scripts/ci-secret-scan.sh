#!/usr/bin/env bash
# CI-mode secret scan — same pattern list as .claude/hooks/pre-commit, but
# diffs against the PR base ref (or the previous commit on a direct push)
# instead of the git staging area. Run from repo root.
#
# Env:
#   BASE_REF — ref to diff against (e.g. origin/main). Defaults to HEAD~1.

set -euo pipefail

BASE_REF="${BASE_REF:-}"
if [ -z "$BASE_REF" ]; then
  if git rev-parse HEAD~1 >/dev/null 2>&1; then
    BASE_REF="HEAD~1"
  else
    echo "ci-secret-scan: no base ref available (shallow single-commit checkout) — skipping."
    exit 0
  fi
fi

PATTERNS_FILE=".claude/hooks/secret-patterns.txt"
if [ ! -f "$PATTERNS_FILE" ]; then
  echo "ci-secret-scan: $PATTERNS_FILE not found — nothing to check against."
  exit 0
fi

changed=$(git diff --name-only --diff-filter=ACM "$BASE_REF"...HEAD)
if [ -z "$changed" ]; then
  echo "ci-secret-scan: no changed files in range."
  exit 0
fi

found=0
for f in $changed; do
  if [ "$f" = ".claude/hooks/pre-commit" ] || [ "$f" = ".claude/hooks/secret-patterns.txt" ] || [ "$f" = "scripts/ci-secret-scan.sh" ]; then continue; fi
  if ! git diff "$BASE_REF"...HEAD -- "$f" | grep -Iq .; then continue; fi

  while IFS= read -r pat; do
    [ -z "$pat" ] && continue
    case "$pat" in \#*) continue ;; esac
    hit=$(git diff -U0 "$BASE_REF"...HEAD -- "$f" | grep -E '^\+' | grep -Ev '^\+\+\+' | grep -E -e "$pat" || true)
    if [ -n "$hit" ]; then
      echo "ci-secret-scan: possible secret in $f (pattern: $pat)"
      echo "$hit" | sed 's/^/    /'
      found=1
    fi
  done < "$PATTERNS_FILE"
done

if [ "$found" -eq 1 ]; then
  echo ""
  echo "CI secret scan failed — a change in this range looks like it contains a real credential."
  exit 1
fi

echo "ci-secret-scan: clean."
exit 0

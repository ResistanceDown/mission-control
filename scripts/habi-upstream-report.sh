#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROTECTED_FILE="$ROOT/config/habi-upstream/protected-paths.txt"
CANDIDATE_FILE="$ROOT/config/habi-upstream/port-candidates.txt"
BASE_REF="${1:-origin/main}"
HEAD_REF="${2:-HEAD}"

mapfile -t DIFF_FILES < <(git -C "$ROOT" diff --name-only "$BASE_REF...$HEAD_REF")

if [[ ${#DIFF_FILES[@]} -eq 0 ]]; then
  echo "No divergence between $BASE_REF and $HEAD_REF"
  exit 0
fi

mapfile -t PROTECTED_PATTERNS < <(grep -v '^[[:space:]]*$' "$PROTECTED_FILE" | grep -v '^[[:space:]]*#')
mapfile -t CANDIDATE_PATTERNS < <(grep -v '^[[:space:]]*$' "$CANDIDATE_FILE" | grep -v '^[[:space:]]*#')

protected_matches=()
candidate_matches=()
other_matches=()

matches_pattern() {
  local file="$1"
  shift
  local pattern
  for pattern in "$@"; do
    if [[ "$file" == "$pattern"* ]]; then
      return 0
    fi
  done
  return 1
}

for file in "${DIFF_FILES[@]}"; do
  if matches_pattern "$file" "${PROTECTED_PATTERNS[@]}"; then
    protected_matches+=("$file")
  elif matches_pattern "$file" "${CANDIDATE_PATTERNS[@]}"; then
    candidate_matches+=("$file")
  else
    other_matches+=("$file")
  fi
done

printf 'Mission Control upstream divergence report\n'
printf 'Base: %s\nHead: %s\n\n' "$BASE_REF" "$HEAD_REF"
printf 'Total changed paths: %d\n' "${#DIFF_FILES[@]}"
printf 'Protected Habi surfaces: %d\n' "${#protected_matches[@]}"
printf 'Port candidates: %d\n' "${#candidate_matches[@]}"
printf 'Unclassified review-needed: %d\n' "${#other_matches[@]}"

print_group() {
  local title="$1"
  shift
  local entries=("$@")
  printf '\n%s\n' "$title"
  if [[ ${#entries[@]} -eq 0 ]]; then
    printf '  (none)\n'
    return
  fi
  local entry
  for entry in "${entries[@]}"; do
    printf '  %s\n' "$entry"
  done
}

print_group "Protected Habi surfaces" "${protected_matches[@]}"
print_group "Safe-first port candidates" "${candidate_matches[@]}"
print_group "Unclassified review-needed paths" "${other_matches[@]}"

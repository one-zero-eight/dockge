#!/usr/bin/env bash
# Rebuild the disposable prod branch from lorwell/master + pending topic branches.
# Usage:
#   ./scripts/rebuild-prod.sh           # assemble and validate candidate, update local prod
#   ./scripts/rebuild-prod.sh --push    # same, then force-with-lease push to origin/prod
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

BASE_REMOTE="${BASE_REMOTE:-lorwell}"
BASE_BRANCH="${BASE_BRANCH:-master}"
PROD_BRANCH="${PROD_BRANCH:-prod}"
ORIGIN_REMOTE="${ORIGIN_REMOTE:-origin}"

# Ordered pending branches. Remove an entry after Lorwell accepts it (incl. squash merges),
# then rebuild from the new base. Do not infer acceptance from ancestry alone.
PENDING_BRANCHES=(
  fix/security-path-traversal
  fix/env-persistence
  fix/clean-exit-status
  chore/security-dependencies
  local/prod-workflow
)

PUSH=0
for arg in "$@"; do
  case "$arg" in
    --push) PUSH=1 ;;
    -h|--help)
      sed -n '2,6p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd git
require_cmd npm
require_cmd npx

if ! git remote get-url "$BASE_REMOTE" >/dev/null 2>&1; then
  echo "Remote '$BASE_REMOTE' is not configured." >&2
  exit 1
fi

echo "==> Fetching ${BASE_REMOTE} and ${ORIGIN_REMOTE}"
git fetch --prune "$BASE_REMOTE" "$BASE_BRANCH"
git fetch --prune "$ORIGIN_REMOTE" "+refs/heads/${PROD_BRANCH}:refs/remotes/${ORIGIN_REMOTE}/${PROD_BRANCH}" 2>/dev/null || true
for branch in "${PENDING_BRANCHES[@]}"; do
  if git show-ref --verify --quiet "refs/heads/${branch}"; then
    continue
  fi
  if git show-ref --verify --quiet "refs/remotes/${ORIGIN_REMOTE}/${branch}"; then
    git branch --track "$branch" "${ORIGIN_REMOTE}/${branch}" >/dev/null
    continue
  fi
  echo "Pending branch not found locally or on ${ORIGIN_REMOTE}: ${branch}" >&2
  exit 1
done

BASE_SHA="$(git rev-parse "${BASE_REMOTE}/${BASE_BRANCH}")"
declare -a PENDING_SHAS=()
declare -a PENDING_NAMES=()
for branch in "${PENDING_BRANCHES[@]}"; do
  sha="$(git rev-parse "refs/heads/${branch}")"
  PENDING_NAMES+=("$branch")
  PENDING_SHAS+=("$sha")
  echo "    pending ${branch} @ ${sha}"
done
echo "    base ${BASE_REMOTE}/${BASE_BRANCH} @ ${BASE_SHA}"

PREV_PROD_SHA=""
if git show-ref --verify --quiet "refs/heads/${PROD_BRANCH}"; then
  PREV_PROD_SHA="$(git rev-parse "refs/heads/${PROD_BRANCH}")"
  echo "    previous local ${PROD_BRANCH} @ ${PREV_PROD_SHA}"
fi

REMOTE_PROD_SHA=""
if git show-ref --verify --quiet "refs/remotes/${ORIGIN_REMOTE}/${PROD_BRANCH}"; then
  REMOTE_PROD_SHA="$(git rev-parse "refs/remotes/${ORIGIN_REMOTE}/${PROD_BRANCH}")"
  echo "    remote ${ORIGIN_REMOTE}/${PROD_BRANCH} @ ${REMOTE_PROD_SHA}"
fi

# Refuse if prod is checked out in another worktree.
if [[ -n "$PREV_PROD_SHA" ]]; then
  while IFS= read -r line; do
    wt_path="${line%% *}"
    if [[ "$line" == *" [${PROD_BRANCH}]"* ]] || [[ "$line" == *" [${PROD_BRANCH] "* ]]; then
      abs_root="$(cd "$ROOT" && pwd)"
      abs_wt="$(cd "$wt_path" && pwd)"
      if [[ "$abs_wt" != "$abs_root" ]]; then
        echo "Refusing to update ${PROD_BRANCH}: checked out in worktree ${wt_path}" >&2
        exit 1
      fi
    fi
  done < <(git worktree list)
fi

CANDIDATE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dockge-prod-candidate.XXXXXX")"
cleanup() {
  if [[ -n "${CANDIDATE_DIR:-}" && -d "$CANDIDATE_DIR" ]]; then
    git worktree remove --force "$CANDIDATE_DIR" 2>/dev/null || rm -rf "$CANDIDATE_DIR"
  fi
}
trap cleanup EXIT

CANDIDATE_BRANCH="prod-candidate-$(date -u +%Y%m%d%H%M%S)-$$"
echo "==> Creating candidate worktree at ${CANDIDATE_DIR}"
git worktree add -b "$CANDIDATE_BRANCH" "$CANDIDATE_DIR" "$BASE_SHA"

merge_failed=0
(
  cd "$CANDIDATE_DIR"
  git config advice.mergeConflict false
  for i in "${!PENDING_NAMES[@]}"; do
    branch="${PENDING_NAMES[$i]}"
    sha="${PENDING_SHAS[$i]}"
    echo "==> Merging ${branch} (${sha})"
    if ! git merge --no-ff --no-edit -m "merge: integrate ${branch} into prod" "$sha"; then
      echo "Merge conflict while integrating ${branch}." >&2
      echo "Candidate left at: ${CANDIDATE_DIR} (branch ${CANDIDATE_BRANCH})" >&2
      echo "Previous ${PROD_BRANCH} was not modified." >&2
      exit 1
    fi
  done
) || merge_failed=1

if [[ "$merge_failed" -ne 0 ]]; then
  trap - EXIT
  echo "Keeping candidate worktree for diagnosis: ${CANDIDATE_DIR}" >&2
  exit 1
fi

echo "==> Validating candidate"
(
  cd "$CANDIDATE_DIR"
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" 2>/dev/null || true
  if command -v nvm >/dev/null 2>&1; then
    nvm use 22 >/dev/null
  fi
  npm ci --no-fund
  npm run lint
  npm run check-ts
  npx tsx --test backend/*.test.ts
  npm run build:frontend
  git diff --check
  git status --short
)

CANDIDATE_SHA="$(git -C "$CANDIDATE_DIR" rev-parse HEAD)"
echo "==> Candidate OK @ ${CANDIDATE_SHA}"

echo "==> Updating local ${PROD_BRANCH}"
if [[ -n "$PREV_PROD_SHA" ]]; then
  current="$(git rev-parse "refs/heads/${PROD_BRANCH}")"
  if [[ "$current" != "$PREV_PROD_SHA" ]]; then
    echo "Local ${PROD_BRANCH} moved during rebuild (${PREV_PROD_SHA} -> ${current}). Aborting." >&2
    exit 1
  fi
  git branch -f "$PROD_BRANCH" "$CANDIDATE_SHA"
else
  git branch "$PROD_BRANCH" "$CANDIDATE_SHA"
fi

echo "Local ${PROD_BRANCH} now at $(git rev-parse "refs/heads/${PROD_BRANCH}")"

if [[ "$PUSH" -eq 1 ]]; then
  if [[ -n "$REMOTE_PROD_SHA" ]]; then
    echo "==> Pushing ${PROD_BRANCH} with --force-with-lease=${PROD_BRANCH}:${REMOTE_PROD_SHA}"
    git push --force-with-lease="${PROD_BRANCH}:${REMOTE_PROD_SHA}" "$ORIGIN_REMOTE" "refs/heads/${PROD_BRANCH}:refs/heads/${PROD_BRANCH}"
  else
    echo "==> Pushing new ${PROD_BRANCH} to ${ORIGIN_REMOTE}"
    git push -u "$ORIGIN_REMOTE" "refs/heads/${PROD_BRANCH}:refs/heads/${PROD_BRANCH}"
  fi
else
  echo "Skipping push (pass --push to publish)."
fi

echo "Done."

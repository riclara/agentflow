#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="$ROOT_DIR/.github/branch-protection/main.json"
OWNER="riclara"
REPO="agentflow"
BRANCH="main"

gh auth status >/dev/null

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "/repos/${OWNER}/${REPO}/branches/${BRANCH}/protection" \
  --input "$CONFIG_FILE"

echo "Applied branch protection to ${OWNER}/${REPO}:${BRANCH}"

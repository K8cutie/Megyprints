#!/usr/bin/env bash
# Activate the secret safety net in THIS repo. Run once per fresh clone:
#   bash .githooks/install.sh
# (core.hooksPath is a local setting and is NOT copied by `git clone`.)
set -e
root="$(git rev-parse --show-toplevel)"
cd "$root"
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit .githooks/pre-push 2>/dev/null || true
echo "✅ Secret safety net active in $root"
echo "   Runs on every commit & push. Bypass (rare): --no-verify"

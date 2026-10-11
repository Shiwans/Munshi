#!/usr/bin/env bash
# Run Munshi's CLI from anywhere. MUNSHI_DIR defaults to the checkout this skill lives in.
set -euo pipefail
DIR="${MUNSHI_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
cd "$DIR"
exec node src/cli.js "$@"

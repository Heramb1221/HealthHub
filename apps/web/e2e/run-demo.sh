#!/usr/bin/env bash
# Builds the app in DEMO mode, serves it, and runs the browser suites (01-09) against it.
#
#   ./e2e/run-demo.sh              # build + all suites
#   ./e2e/run-demo.sh 03 06        # build + only suites 03 and 06
#   SKIP_BUILD=1 ./e2e/run-demo.sh # reuse an existing demo build in .next
#   PORT=3200 ./e2e/run-demo.sh    # choose the port (default 3100)
#
# Exit code is non-zero if the build fails or any suite fails. See e2e/README.md for prerequisites.
set -u
cd "$(dirname "$0")/.."
PORT="${PORT:-3100}"
export BASE_URL="http://localhost:${PORT}"
LOG_DIR="${TMPDIR:-/tmp}"

if [ -z "${SKIP_BUILD:-}" ]; then
  echo "Building (demo mode)..."
  NEXT_PUBLIC_API_MODE=demo npm run build >"$LOG_DIR/healthhub-build.log" 2>&1 || { echo "BUILD FAILED"; tail -25 "$LOG_DIR/healthhub-build.log"; exit 1; }
fi

node_modules/.bin/next start -p "$PORT" >"$LOG_DIR/healthhub-server.log" 2>&1 &
SERVER_PID=$!
cleanup() { pkill -P "$SERVER_PID" 2>/dev/null; kill "$SERVER_PID" 2>/dev/null; }
trap cleanup EXIT

for _ in $(seq 1 60); do curl -sf "$BASE_URL/sign-in" >/dev/null 2>&1 && break; sleep 0.5; done
curl -sf "$BASE_URL/sign-in" >/dev/null 2>&1 || { echo "SERVER DID NOT START"; tail -20 "$LOG_DIR/healthhub-server.log"; exit 1; }

if [ "$#" -gt 0 ]; then wanted=("$@"); else wanted=(01 02 03 04 05 06 07 08 09); fi
failed=0
for n in "${wanted[@]}"; do
  file=$(ls e2e/${n}_*.py 2>/dev/null | head -1)
  [ -z "$file" ] && { echo "no suite $n"; failed=1; continue; }
  if [ "$n" = "09" ] && [ ! -f "${AXE_JS:-node_modules/axe-core/axe.min.js}" ]; then
    echo "== $file: SKIPPED (run: npm install --no-save axe-core)"; continue
  fi
  echo "== $file"
  out=$(python3 "$file" 2>&1); code=$?
  echo "$out" | grep -E "^FAIL|Traceback|Error" | head -8
  echo "   $(echo "$out" | grep -c '^PASS') checks passed, exit $code"
  [ "$code" -ne 0 ] && failed=1
done
exit $failed

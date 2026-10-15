#!/usr/bin/env bash
# Builds the app in LIVE mode, checks that no demo code or credentials are in the build output, then runs suite 10
# (the live-mode client against a STUBBED API). Replaces .next, so run it AFTER ./e2e/run-demo.sh.
# This is not a test of a real backend: the API is simulated by the browser (see e2e/10_live_mode_stub.py).
set -u
cd "$(dirname "$0")/.."
PORT="${PORT:-3101}"
export BASE_URL="http://localhost:${PORT}"
LOG_DIR="${TMPDIR:-/tmp}"

echo "Building (live mode)..."
NEXT_PUBLIC_API_MODE=live npm run build >"$LOG_DIR/healthhub-build-live.log" 2>&1 || { echo "BUILD FAILED"; tail -25 "$LOG_DIR/healthhub-build-live.log"; exit 1; }

echo "Checking the live build for demo code..."
leaks=0
for s in "DemoAdmin#1" "DemoPatient#1" "demo.admin@healthhub.test" "healthhub-demo-" "Dr. Sample Prescriber"; do
  n=$(grep -rl --include=*.js -- "$s" .next/static .next/server 2>/dev/null | wc -l)
  if [ "$n" -ne 0 ]; then echo "  LEAK: '$s' found in $n built file(s)"; leaks=1; fi
done
[ "$leaks" -eq 0 ] && echo "  none found" || exit 1

NEXT_PUBLIC_API_MODE=live node_modules/.bin/next start -p "$PORT" >"$LOG_DIR/healthhub-server-live.log" 2>&1 &
SERVER_PID=$!
cleanup() { pkill -P "$SERVER_PID" 2>/dev/null; kill "$SERVER_PID" 2>/dev/null; }
trap cleanup EXIT
for _ in $(seq 1 60); do curl -sf "$BASE_URL/sign-in" >/dev/null 2>&1 && break; sleep 0.5; done
curl -sf "$BASE_URL/sign-in" >/dev/null 2>&1 || { echo "SERVER DID NOT START"; tail -20 "$LOG_DIR/healthhub-server-live.log"; exit 1; }

echo "== e2e/10_live_mode_stub.py"
out=$(python3 e2e/10_live_mode_stub.py 2>&1); code=$?
echo "$out" | grep -E "^FAIL|Traceback|Error" | head -8
echo "   $(echo "$out" | grep -c '^PASS') checks passed, exit $code"
exit $code

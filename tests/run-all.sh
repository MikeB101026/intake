#!/usr/bin/env bash
# Runs every regression test one after another (about 10 minutes). Needs Node and Playwright with Chromium.
# Usage: tests/run-all.sh            (tests this checkout)
#        REPO=/path/to/other/copy tests/run-all.sh
cd "$(dirname "$0")" || exit 1
fail=0
for f in t00_smoke.js g*.js r_*.js; do
  if timeout 300 node "$f" > "/tmp/intake-test-$f.log" 2>&1; then tail -1 "/tmp/intake-test-$f.log"; else echo "FAILED $f (log: /tmp/intake-test-$f.log)"; fail=1; fi
done
exit $fail

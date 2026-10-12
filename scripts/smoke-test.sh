#!/usr/bin/env bash
# Usage: smoke-test.sh <base_url> [expected_version]
# Verifies the public endpoint through the ALB. Retries because ALB weight
# changes take a few seconds to propagate.
set -uo pipefail
URL="${1:?base url required}"; EXPECT="${2:-}"
ATTEMPTS="${ATTEMPTS:-12}"

check() {
  local out code body
  # 1. API health + DB connectivity (+ version if requested)
  out="$(curl -s -m 5 -w '\n%{http_code}' "$URL/api/health")"; code="$(tail -n1 <<<"$out")"; body="$(sed '$d' <<<"$out")"
  [ "$code" = 200 ] || { echo "  /api/health -> HTTP $code"; return 1; }
  if [ -n "$EXPECT" ]; then
    [ "$(jq -r .version <<<"$body")" = "$EXPECT" ] || { echo "  version is $(jq -r .version <<<"$body"), want $EXPECT"; return 1; }
  fi
  # 2. API reads from MongoDB
  curl -sf -m 5 "$URL/api/tasks" | jq -e 'type=="array"' >/dev/null || { echo "  /api/tasks did not return an array"; return 1; }
  # 3. Frontend serves the SPA shell
  curl -sf -m 5 "$URL/" | grep -q 'id="root"' || { echo "  frontend index.html missing root div"; return 1; }
  return 0
}

for i in $(seq 1 "$ATTEMPTS"); do
  echo "Smoke test attempt $i/$ATTEMPTS against $URL"
  if check; then echo "Smoke test PASSED"; exit 0; fi
  sleep 5
done
echo "Smoke test FAILED"; exit 1

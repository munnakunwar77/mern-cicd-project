#!/usr/bin/env bash
# Canary release: deploy to the idle color, then shift traffic in steps
# (default 10% -> 50% -> 100%). At every step we bake, probe the public
# endpoint and check CloudWatch 5XX counts; any breach rolls back automatically.
#
# Usage: deploy-canary.sh <image_tag>
# Tunables (env): CANARY_STEPS="10 50 100"  BAKE_SECONDS=120  MAX_ERROR_PCT=1  USE_CLOUDWATCH=true
source "$(dirname "$0")/lib.sh"
TAG="${1:?image tag required}"
ALB_URL="${ALB_URL:-http://$(alb_dns)}"
CANARY_STEPS="${CANARY_STEPS:-10 50 100}"
BAKE_SECONDS="${BAKE_SECONDS:-120}"
MAX_ERROR_PCT="${MAX_ERROR_PCT:-1}"
USE_CLOUDWATCH="${USE_CLOUDWATCH:-true}"

ACTIVE="$(active_color)"; NEW="$(other_color "$ACTIVE")"
log "Canary deploy of '$TAG': stable=$ACTIVE, canary=$NEW, steps=[$CANARY_STEPS]"

abort() {
  log "ROLLBACK: $1"
  set_color_pct "$ACTIVE" 100
  scale_color "$NEW" 0
  exit 1
}

deploy_idle "$TAG" "$NEW" || { scale_color "$NEW" 0; die "canary environment never became healthy; traffic untouched"; }

for pct in $CANARY_STEPS; do
  set_color_pct "$NEW" "$pct"
  log "Canary at ${pct}% - baking for ${BAKE_SECONDS}s"
  probes=$((BAKE_SECONDS * 2))                       # 1 request every 0.5s
  probe "$ALB_URL" "$probes" "$TAG" 0.5
  fail_pct=$(( PROBE_FAIL * 100 / PROBE_TOTAL ))
  log "Probe results: total=$PROBE_TOTAL failed=$PROBE_FAIL (${fail_pct}%) served-by-canary=$PROBE_NEW"

  [ "$fail_pct" -le "$MAX_ERROR_PCT" ] || abort "error rate ${fail_pct}% exceeds ${MAX_ERROR_PCT}% at ${pct}%"
  if [ "$pct" -lt 100 ] && [ "$PROBE_NEW" -eq 0 ]; then
    log "WARNING: no probe request reached the canary at ${pct}% (statistically unlikely) - continuing"
  fi

  if [ "$USE_CLOUDWATCH" = true ]; then
    for comp in "${COMPONENTS[@]}"; do
      tg="$(tg_arn "$comp" "$NEW")"
      errs="$(cw_sum HTTPCode_Target_5XX_Count "$tg" 5)"
      reqs="$(cw_sum RequestCount "$tg" 5)"
      log "CloudWatch ($comp, last 5m): requests=$reqs target-5xx=$errs"
      if [ "$reqs" -gt 0 ] && [ $(( errs * 100 / reqs )) -gt "$MAX_ERROR_PCT" ]; then
        abort "$comp 5XX rate above ${MAX_ERROR_PCT}% according to CloudWatch"
      fi
    done
  fi
done

"$SCRIPT_DIR/smoke-test.sh" "$ALB_URL" "$TAG" || abort "final smoke test failed"

write_state "$NEW" "$ACTIVE" "$TAG"
log "SUCCESS: canary promoted. $NEW is live ($TAG); $ACTIVE kept as standby."

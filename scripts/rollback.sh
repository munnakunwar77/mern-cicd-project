#!/usr/bin/env bash
# Instantly send 100% of traffic back to the previous color.
# If the standby was already scaled to zero (finalize.sh), it is started first.
# Usage: rollback.sh
source "$(dirname "$0")/lib.sh"
ALB_URL="${ALB_URL:-http://$(alb_dns)}"

LIVE="$(active_color)"; TARGET="$(other_color "$LIVE")"
log "Rolling back: live=$LIVE -> $TARGET"

running="$(aws ecs describe-services --cluster "$CLUSTER" --services "${PROJECT}-backend-${TARGET}" \
            --query 'services[0].runningCount' --output text)"
if [ "$running" -lt "$DESIRED_COUNT" ]; then
  log "Standby has $running running tasks - scaling it up first"
  scale_color "$TARGET" "$DESIRED_COUNT"
  wait_color_stable "$TARGET"
  for comp in "${COMPONENTS[@]}"; do wait_tg_healthy "$(tg_arn "$comp" "$TARGET")" || die "standby unhealthy"; done
fi

set_color_pct "$TARGET" 100
"$SCRIPT_DIR/smoke-test.sh" "$ALB_URL" || die "smoke test failed after rollback - investigate immediately"
write_state "$TARGET" "$LIVE" "rollback"
log "Rollback complete. $TARGET is live; $LIVE left running for investigation."

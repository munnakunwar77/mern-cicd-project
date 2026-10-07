#!/usr/bin/env bash
# Scale the non-live color down to zero to stop paying for it.
# Only runs when traffic is fully on one color (not mid-canary).
source "$(dirname "$0")/lib.sh"
pct="$(current_green_pct)"
[ "$pct" -eq 0 ] || [ "$pct" -eq 100 ] || die "traffic is split ($pct% green) - refusing to scale down"
LIVE="$(active_color)"; STANDBY="$(other_color "$LIVE")"
log "Live=$LIVE. Scaling standby ($STANDBY) to 0"
scale_color "$STANDBY" 0
log "Done. Roll back later with scripts/rollback.sh (it will restart the standby)."

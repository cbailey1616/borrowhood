#!/usr/bin/env bash

# ============================================
# Maestro Seed, Run, and Cleanup
# ============================================
#
# Seeds test data, runs Maestro flows, then cleans up.
# Optionally runs a device matrix for screenshot capture.
#
# Usage:
#   .maestro/scripts/seed-and-run.sh                      # Run all flows
#   .maestro/scripts/seed-and-run.sh flows/auth/           # Run specific flow dir
#   .maestro/scripts/seed-and-run.sh --screenshots         # Run with device matrix
#   .maestro/scripts/seed-and-run.sh --tag smoke           # Run flows by tag
#   .maestro/scripts/seed-and-run.sh --skip-seed           # Skip seed step
#   .maestro/scripts/seed-and-run.sh --skip-cleanup        # Skip cleanup step

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAESTRO_DIR="$(dirname "$SCRIPT_DIR")"
MOBILE_DIR="$(dirname "$MAESTRO_DIR")"

# Defaults
FLOW_PATH=""
SCREENSHOTS=false
TAG=""
SKIP_SEED=false
SKIP_CLEANUP=false
EXIT_CODE=0

# Device matrix for screenshots (iPhone models common in App Store assets)
DEVICE_MATRIX=(
  "iPhone 16 Pro Max"
  "iPhone 16 Pro"
  "iPhone SE (3rd generation)"
)

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --screenshots)
      SCREENSHOTS=true
      shift
      ;;
    --tag)
      TAG="$2"
      shift 2
      ;;
    --skip-seed)
      SKIP_SEED=true
      shift
      ;;
    --skip-cleanup)
      SKIP_CLEANUP=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [options] [flow-path]"
      echo ""
      echo "Options:"
      echo "  --screenshots    Run flows on device matrix for screenshot capture"
      echo "  --tag <tag>      Run only flows matching this tag"
      echo "  --skip-seed      Skip the test data seeding step"
      echo "  --skip-cleanup   Skip the test data cleanup step"
      echo "  --help, -h       Show this help message"
      echo ""
      echo "Arguments:"
      echo "  flow-path        Specific flow file or directory to run (default: all)"
      exit 0
      ;;
    -*)
      echo "Unknown option: $1"
      exit 1
      ;;
    *)
      FLOW_PATH="$1"
      shift
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_step()  { echo -e "\n${BLUE}==>${NC} $1"; }
log_ok()    { echo -e "${GREEN}OK:${NC} $1"; }
log_warn()  { echo -e "${YELLOW}WARN:${NC} $1"; }
log_err()   { echo -e "${RED}ERROR:${NC} $1"; }

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------
log_step "Preflight checks"

if ! command -v maestro &>/dev/null; then
  log_err "Maestro CLI not found. Install: https://maestro.mobile.dev/getting-started/installing-maestro"
  exit 1
fi

if ! command -v node &>/dev/null; then
  log_err "Node.js not found."
  exit 1
fi

log_ok "Maestro CLI and Node.js found"

# ---------------------------------------------------------------------------
# Seed test data
# ---------------------------------------------------------------------------
if [[ "$SKIP_SEED" == "false" ]]; then
  log_step "Seeding test data"
  if node "$SCRIPT_DIR/seed-maestro-data.js"; then
    log_ok "Test data seeded"
  else
    log_err "Seed failed"
    exit 1
  fi
else
  log_warn "Skipping seed (--skip-seed)"
fi

# ---------------------------------------------------------------------------
# Build Maestro command
# ---------------------------------------------------------------------------
build_maestro_cmd() {
  local cmd="maestro test"

  # Add tag filter
  if [[ -n "$TAG" ]]; then
    cmd="$cmd --include-tags=$TAG"
  fi

  # Add flow path or default to .maestro directory
  if [[ -n "$FLOW_PATH" ]]; then
    # Resolve relative paths from MAESTRO_DIR
    if [[ "$FLOW_PATH" != /* ]]; then
      cmd="$cmd $MAESTRO_DIR/$FLOW_PATH"
    else
      cmd="$cmd $FLOW_PATH"
    fi
  else
    cmd="$cmd $MAESTRO_DIR"
  fi

  echo "$cmd"
}

# ---------------------------------------------------------------------------
# Run Maestro flows
# ---------------------------------------------------------------------------
run_maestro() {
  local cmd
  cmd=$(build_maestro_cmd)
  log_step "Running: $cmd"
  if eval "$cmd"; then
    log_ok "Maestro flows passed"
    return 0
  else
    log_err "Maestro flows failed"
    return 1
  fi
}

if [[ "$SCREENSHOTS" == "true" ]]; then
  log_step "Running device matrix for screenshots"

  SCREENSHOT_DIR="$MAESTRO_DIR/screenshots/$(date +%Y%m%d_%H%M%S)"
  mkdir -p "$SCREENSHOT_DIR"

  for device in "${DEVICE_MATRIX[@]}"; do
    log_step "Device: $device"

    DEVICE_DIR="$SCREENSHOT_DIR/$(echo "$device" | tr ' ' '_')"
    mkdir -p "$DEVICE_DIR"

    # Boot the simulator for this device
    DEVICE_UDID=$(xcrun simctl list devices available | grep "$device" | head -1 | grep -oE '[A-F0-9-]{36}')

    if [[ -z "$DEVICE_UDID" ]]; then
      log_warn "Device '$device' not found in simulators, skipping"
      continue
    fi

    xcrun simctl boot "$DEVICE_UDID" 2>/dev/null || true
    sleep 2

    # Run Maestro targeting this device
    MAESTRO_DEVICE_ID="$DEVICE_UDID" run_maestro || EXIT_CODE=1

    # Copy screenshots
    if ls "$MAESTRO_DIR"/screenshots/*.png &>/dev/null 2>&1; then
      mv "$MAESTRO_DIR"/screenshots/*.png "$DEVICE_DIR/" 2>/dev/null || true
    fi

    # Shutdown simulator
    xcrun simctl shutdown "$DEVICE_UDID" 2>/dev/null || true

    log_ok "Completed: $device"
  done

  log_step "Screenshots saved to $SCREENSHOT_DIR"
else
  run_maestro || EXIT_CODE=1
fi

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
if [[ "$SKIP_CLEANUP" == "false" ]]; then
  log_step "Cleaning up test data"
  if node "$SCRIPT_DIR/cleanup-maestro-data.js"; then
    log_ok "Test data cleaned up"
  else
    log_warn "Cleanup failed (test data may remain)"
  fi
else
  log_warn "Skipping cleanup (--skip-cleanup)"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
if [[ $EXIT_CODE -eq 0 ]]; then
  log_ok "All done! Maestro tests passed."
else
  log_err "Maestro tests had failures (exit code $EXIT_CODE)."
fi

exit $EXIT_CODE

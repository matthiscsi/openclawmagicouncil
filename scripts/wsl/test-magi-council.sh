#!/usr/bin/env bash
set -Eeuo pipefail

MAGI_HOME="${MAGI_HOME:-$HOME/.openclaw-magi}"
export MAGI_HOME
export OPENCLAW_CONFIG_PATH="$MAGI_HOME/openclaw.json"
export OPENCLAW_STATE_DIR="$MAGI_HOME/state"
export PATH="${HOME}/.npm-global/bin:${PATH}"

if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" && -f "$MAGI_HOME/gateway.env" ]]; then
  OPENCLAW_GATEWAY_TOKEN="$(grep '^OPENCLAW_GATEWAY_TOKEN=' "$MAGI_HOME/gateway.env" | head -n1 | cut -d= -f2-)"
  export OPENCLAW_GATEWAY_TOKEN
fi

if ! command -v openclaw >/dev/null 2>&1; then
  echo "openclaw is not installed in PATH."
  exit 1
fi

if [[ $# -gt 0 ]]; then
  MESSAGE="$*"
elif [[ -t 0 ]]; then
  echo "Usage: bash scripts/wsl/test-magi-council.sh <message>"
  echo "   or: bash scripts/wsl/test-magi-council.sh <<'EOF' ... EOF"
  exit 1
else
  MESSAGE="$(cat)"
fi

SESSION_TO="${SESSION_TO:-+15555550123}"
SESSION_CHANNEL="${SESSION_CHANNEL:-}"
SESSION_ID="${SESSION_ID:-}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-180}"

echo "Using test session target: $SESSION_TO"
echo "Submitting MAGI request..."
echo

agent_args=(
  --agent magi
  --to "$SESSION_TO"
  --message "$MESSAGE"
  --thinking low
  --timeout "$TIMEOUT_SECONDS"
)

if [[ -n "$SESSION_CHANNEL" ]]; then
  agent_args+=(--channel "$SESSION_CHANNEL")
fi

if [[ -n "$SESSION_ID" ]]; then
  agent_args+=(--session-id "$SESSION_ID")
fi

openclaw agent "${agent_args[@]}"

echo
echo "Session files now present under ~/.openclaw-magi/state/agents:"
find "$MAGI_HOME/state/agents" -maxdepth 4 -type f | sort

#!/usr/bin/env bash
set -Eeuo pipefail

MAGI_HOME="${MAGI_HOME:-$HOME/.openclaw-magi}"
export MAGI_HOME
export OPENCLAW_CONFIG_PATH="$MAGI_HOME/openclaw.json"
export OPENCLAW_STATE_DIR="$MAGI_HOME/state"
export PATH="${HOME}/.npm-global/bin:${PATH}"

if ! command -v openclaw >/dev/null 2>&1; then
  echo "openclaw is not installed in PATH. Run scripts/wsl/bootstrap-openclaw.sh first."
  exit 1
fi

ensure_agent_dir() {
  local agent_id="$1"
  local agent_dir="$MAGI_HOME/agents/$agent_id/agent"

  mkdir -p "$agent_dir"
  printf '%s\n' "$agent_dir"
}

auth_file() {
  local agent_id="$1"
  printf '%s\n' "$MAGI_HOME/agents/$agent_id/agent/auth-profiles.json"
}

login_agent() {
  local agent_id="$1"
  local agent_dir
  agent_dir="$(ensure_agent_dir "$agent_id")"

  if [[ -s "$(auth_file "$agent_id")" ]]; then
    echo "=== $agent_id already has OpenAI Codex auth; skipping login ==="
    return 0
  fi

  echo
  echo "=== OpenAI Codex login for $agent_id ==="
  echo "A browser-based ChatGPT/Codex OAuth flow will start."
  echo "If callback capture fails, paste the redirected URL back into the CLI."

  OPENCLAW_AGENT_DIR="$agent_dir" \
    openclaw models auth login --provider openai-codex
}

propagate_auth() {
  local source_agent="$1"
  local source_file
  source_file="$(auth_file "$source_agent")"

  if [[ ! -s "$source_file" ]]; then
    echo "No auth file found for $source_agent at $source_file"
    return 1
  fi

  for agent_id in magi melchior balthasar casper; do
    local target_dir target_file
    target_dir="$(ensure_agent_dir "$agent_id")"
    target_file="$target_dir/auth-profiles.json"

    if [[ "$agent_id" == "$source_agent" ]]; then
      continue
    fi

    cp "$source_file" "$target_file"
    chmod 600 "$target_file"
    echo "Seeded OpenAI Codex auth for $agent_id"
  done
}

login_agent "magi"
propagate_auth "magi"

echo
echo "Auth flow complete. Verify with:"
echo "  OPENCLAW_CONFIG_PATH=$OPENCLAW_CONFIG_PATH OPENCLAW_STATE_DIR=$OPENCLAW_STATE_DIR openclaw models status --plain --probe"

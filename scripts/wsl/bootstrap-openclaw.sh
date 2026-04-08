#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
MAGI_HOME="${MAGI_HOME:-$HOME/.openclaw-magi}"
PLUGIN_ROOT="$REPO_ROOT/plugins/magi-admin"
LOG_DIR="$MAGI_HOME/logs"
BOOTSTRAP_LOG="$LOG_DIR/bootstrap.log"
PLUGIN_STAGE_DIR="$MAGI_HOME/staging/magi-admin"
PLUGIN_INSTALL_DIR="$HOME/.openclaw/extensions/magi-admin"

mkdir -p \
  "$MAGI_HOME" \
  "$MAGI_HOME/agents" \
  "$LOG_DIR" \
  "$MAGI_HOME/state" \
  "$MAGI_HOME/workspaces" \
  "$MAGI_HOME/workflows"

exec > >(tee -a "$BOOTSTRAP_LOG") 2>&1

copy_workspace() {
  local source_dir="$1"
  local target_dir="$2"

  mkdir -p "$target_dir"
  cp -R "$source_dir/." "$target_dir/"
}

mkdir -p \
  "$MAGI_HOME/agents/magi/agent" \
  "$MAGI_HOME/agents/melchior/agent" \
  "$MAGI_HOME/agents/balthasar/agent" \
  "$MAGI_HOME/agents/casper/agent"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node 24 or Node 22.14+ before bootstrapping OpenClaw."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required."
  exit 1
fi

export PATH="$(npm config get prefix)/bin:$PATH"
export MAGI_HOME
export OPENCLAW_CONFIG_PATH="$MAGI_HOME/openclaw.json"
export OPENCLAW_STATE_DIR="$MAGI_HOME/state"

if ! docker info >/dev/null 2>&1; then
  echo "A working Docker socket is required for the configured sandbox backend."
  echo "Run scripts/wsl/install-docker-engine.sh first, or ensure Docker Desktop WSL integration is reachable."
  exit 1
fi

if ! command -v openclaw >/dev/null 2>&1; then
  npm install -g openclaw@latest
fi

cp "$REPO_ROOT/config/openclaw.json" "$MAGI_HOME/openclaw.json"
cp "$REPO_ROOT/.env.example" "$MAGI_HOME/gateway.env.example"
cp "$REPO_ROOT/.prose/magi-council.prose" "$MAGI_HOME/workflows/magi-council.prose"
cp "$REPO_ROOT/config/discord.overlay.example.json" "$MAGI_HOME/discord.overlay.example.json"

copy_workspace "$REPO_ROOT/workspaces/magi" "$MAGI_HOME/workspaces/magi"
copy_workspace "$REPO_ROOT/workspaces/melchior" "$MAGI_HOME/workspaces/melchior"
copy_workspace "$REPO_ROOT/workspaces/balthasar" "$MAGI_HOME/workspaces/balthasar"
copy_workspace "$REPO_ROOT/workspaces/casper" "$MAGI_HOME/workspaces/casper"

if [[ ! -f "$MAGI_HOME/gateway.env" ]]; then
  cp "$REPO_ROOT/.env.example" "$MAGI_HOME/gateway.env"
fi

rm -rf "$PLUGIN_STAGE_DIR" "$PLUGIN_INSTALL_DIR"
mkdir -p "$PLUGIN_STAGE_DIR"
cp -R "$PLUGIN_ROOT/." "$PLUGIN_STAGE_DIR/"
find "$PLUGIN_STAGE_DIR" -type d -exec chmod 755 {} +
find "$PLUGIN_STAGE_DIR" -type f -exec chmod 644 {} +

openclaw plugins install "$PLUGIN_STAGE_DIR"

if [[ -d "$PLUGIN_INSTALL_DIR" ]]; then
  find "$PLUGIN_INSTALL_DIR" -type d -exec chmod 755 {} +
  find "$PLUGIN_INSTALL_DIR" -type f -exec chmod 644 {} +
fi

openclaw plugins enable open-prose || true
openclaw plugins enable magi-admin || true

if ! docker image inspect openclaw-sandbox:bookworm-slim >/dev/null 2>&1; then
  OPENCLAW_NPM_ROOT="$(npm root -g)"
  SANDBOX_SETUP="$OPENCLAW_NPM_ROOT/openclaw/scripts/sandbox-setup.sh"

  if [[ -f "$SANDBOX_SETUP" ]]; then
    bash "$SANDBOX_SETUP"
  else
    echo "Bundled sandbox builder not found at:"
    echo "  $SANDBOX_SETUP"
    echo "Using the current OpenClaw default-image fallback instead."
    docker pull debian:bookworm-slim
    docker tag debian:bookworm-slim openclaw-sandbox:bookworm-slim
  fi
fi

echo "MAGI bootstrap complete."
echo "Edit $MAGI_HOME/gateway.env with your gateway token."
echo "Then sign the seats in with: bash scripts/wsl/login-openai-codex-all.sh"
echo "Then run: bash scripts/wsl/install-openclaw-magi-service.sh"

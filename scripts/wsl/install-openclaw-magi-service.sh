#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
UNIT_SOURCE="$REPO_ROOT/config/systemd/openclaw-magi.service"
UNIT_TARGET="$HOME/.config/systemd/user/openclaw-magi.service"
MAGI_HOME="${MAGI_HOME:-$HOME/.openclaw-magi}"
LOG_DIR="$MAGI_HOME/logs"
INSTALL_LOG="$LOG_DIR/service-install.log"

mkdir -p "$LOG_DIR"
exec > >(tee -a "$INSTALL_LOG") 2>&1

mkdir -p "$HOME/.config/systemd/user"
cp "$UNIT_SOURCE" "$UNIT_TARGET"

systemctl --user daemon-reload
systemctl --user enable --now openclaw-magi.service

if command -v loginctl >/dev/null 2>&1; then
  if loginctl show-user "$USER" -p Linger 2>/dev/null | grep -q "Linger=yes"; then
    echo "linger already enabled for $USER"
  elif sudo -n true 2>/dev/null; then
    sudo loginctl enable-linger "$USER"
    echo "enabled linger for $USER"
  else
    echo "For headless boot, run: sudo loginctl enable-linger $USER"
  fi
fi

echo "Installed systemd user unit at $UNIT_TARGET"
echo "Service status:"
systemctl --user status openclaw-magi.service --no-pager || true

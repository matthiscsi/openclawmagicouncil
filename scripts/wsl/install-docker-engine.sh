#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -eq 0 ]]; then
  echo "Run this script as your normal user. It will use sudo when needed."
  exit 1
fi

if docker info >/dev/null 2>&1 && [[ "${FORCE_NATIVE_DOCKER:-0}" != "1" ]]; then
  DOCKER_ENDPOINT="$(docker context inspect default --format '{{(index .Endpoints "docker").Host}}' 2>/dev/null || true)"
  echo "Docker is already reachable inside WSL."
  echo "Endpoint: ${DOCKER_ENDPOINT:-unknown}"
  echo "Skipping Docker Engine install to avoid interfering with the current Docker setup."
  echo "Set FORCE_NATIVE_DOCKER=1 if you explicitly want a native Docker Engine inside this distro."
  exit 0
fi

sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

source /etc/os-release
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker

echo "Docker Engine installed."
echo "Restart your WSL shell or run 'newgrp docker' before using Docker without sudo."

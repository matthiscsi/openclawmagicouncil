# Home Server Knowledge Base (SERVER.md)

This file contains the architectural details of the host system. Use this as the "Central Nervous System" for identifying service endpoints and hardware constraints.

## Host Specifications
- **Operating System**: Windows 11 Pro (Host) / Ubuntu 22.04 LTS (WSL2)
- **Architecture**: x86_64
- **Memory**: [Redacted - Update with real values]
- **Storage**: [Redacted - Update with real values]

## Internal Service Map
- **OpenClaw Gateway**: `http://127.0.0.1:18790`
- **Docker Engine**: Reachable via WSL socket

## Network Topology
- **Internal IP**: [Redacted]
- **Tailscale Address**: [Redacted]
- **Pi-hole**: [Redacted - Expected at http://pi.hole]

## Critical Paths
- **MAGI Home**: `~/.openclaw-magi`
- **Sandbox Root**: `${MAGI_HOME}/sandboxes`

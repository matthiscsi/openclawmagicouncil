# Home Server Knowledge Base (SERVER.md)

This file contains the architectural details of the host system. Use this as the "Central Nervous System" for identifying service endpoints and hardware constraints.

## Host Specifications
- **Operating System**: Microsoft Windows 11 Pro build 26200 (host) / Ubuntu 24.04.3 LTS on WSL2 (`6.6.87.2-microsoft-standard-WSL2`)
- **Architecture**: x86_64
- **CPU**: Intel(R) Core(TM) i3-7100 CPU @ 3.90GHz (2 cores / 4 threads)
- **GPU**: Radeon (TM) RX 480 Graphics (4 GiB VRAM, experimental local-inference only)
- **Memory**: 11.94 GiB physical RAM
- **Storage**: `C:` 237.54 GiB total / 23.54 GiB free, `D:` 3726.02 GiB total / 1756.98 GiB free

## Internal Service Map
- **OpenClaw Gateway**: `http://127.0.0.1:18790`
- **MAGI Tailnet UI**: `https://homeserver.tailf7a295.ts.net:18790` (tailnet only)
- **Jellyfin**: `https://homeserver.tailf7a295.ts.net:8443/web/#/home` (Tailscale Funnel/public)
- **Nextcloud**: `https://homeserver.tailf7a295.ts.net/apps/files/files` (current root Serve route on the tailnet hostname)
- **Pi-hole**: `http://192.168.129.169:60123/admin/login` (LAN-only)
- **Docker Engine**: Reachable via WSL socket (`docker context show` -> `default`)

## Network Topology
- **Internal IP**: `192.168.129.169/23` (Ethernet)
- **Tailscale Address**: `100.100.237.73` (`homeserver.tailf7a295.ts.net`)
- **MAGI Exposure**: tailnet-only on `https://homeserver.tailf7a295.ts.net:18790`
- **Jellyfin Exposure**: public internet via Tailscale Funnel on `https://homeserver.tailf7a295.ts.net:8443`
- **Nextcloud Exposure**: current root Tailscale Serve route on `https://homeserver.tailf7a295.ts.net`
- **Pi-hole Reachability**: LAN-only on `http://192.168.129.169:60123`; `http://pi.hole` also resolves on the local network (observed IPv6 alias: `fd35:4f1b:8326::3`)

## Critical Paths
- **MAGI Home**: `~/.openclaw-magi`
- **Sandbox Root**: `${MAGI_HOME}/sandboxes`

# MAGI for OpenClaw

This repository is a deployable starter kit for a MAGI-style OpenClaw setup on a budget Windows 11 homeserver running WSL2.

The design keeps one public conductor agent, `magi`, plus three internal council seats:

- `melchior`: logic, policy, and architecture
- `balthasar`: operator impact, usability, and dissent from the human angle
- `casper`: adversarial review, blast radius, and veto authority on critical risk

The current default stack is all OpenAI via ChatGPT/Codex OAuth:

- `magi`: `openai-codex/gpt-5.4`
- `melchior`: `openai-codex/gpt-5.4`
- `balthasar`: `openai-codex/gpt-5.4`
- `casper`: `openai-codex/gpt-5.4`

The seats stay role-distinct through isolated workspaces, prompts, and different reasoning defaults. Later, you can swap any seat back to another provider without changing the council workflow.

## Current Deployment Snapshot

- Host profile: Windows 11 Pro build `26200` + Ubuntu `24.04.3` on WSL2, Intel `i3-7100`, Radeon `RX 480` (`4 GiB VRAM`), `11.94 GiB` RAM
- Local MAGI UI: `http://127.0.0.1:18790/`
- Tailnet MAGI UI: `https://homeserver.tailf7a295.ts.net:18790/`
- Auth model: shared gateway password, OpenClaw device pairing disabled
- Exposure model: MAGI stays tailnet-only; it is not published on Tailscale Funnel
- Cost posture: heartbeat disabled, low default reasoning, low default subagent thinking, tiered council depth (`quick` / `standard` / `critical`)
- Safety posture: sandbox network stays `none`; MAGI is back to the tighter v1-style boundary instead of broad execution/network access

Related host/service details now live in `workspaces/magi/SERVER.md`.
Runtime architecture details now live in `docs/runtime-architecture.md`.
Identity/config baseline details now live in `docs/council-identity-and-config.md`.

## What Is Included

- `config/openclaw.json`: locked-down multi-agent OpenClaw config
- `workspaces/*`: the four agent persona files
- `.prose/magi-council.prose`: manual OpenProse workflow for the council loop
- `plugins/magi-admin`: a local plugin with allowlisted MAGI-only admin tools
- `scripts/windows/*`: WSL and startup automation scripts
- `scripts/wsl/*`: WSL bootstrap, Docker Engine, and systemd service scripts
- `config/systemd/openclaw-magi.service`: the systemd user unit template

## Intended Safety Boundary

This kit is opinionated:

- no free host shell for the agent
- no direct access to Pi-hole, Jellyfin, Nextcloud, or unrelated service data
- no direct credentials for unrelated homeserver apps
- only `magi` may execute safe admin actions, and only through the `magi-admin` plugin
- council seats are sandboxed and read-mostly
- sandbox networking is disabled by default (`network: "none"`)

## Quick Start

1. On the target Windows server, install WSL Ubuntu:

```powershell
pwsh -File .\scripts\windows\install-ubuntu-wsl.ps1
```

If Ubuntu is already installed, the script detects it and skips reinstallation.

2. Inside Ubuntu WSL, make sure a working Docker socket is available for sandboxing:

```bash
bash ./scripts/wsl/install-docker-engine.sh
```

If Docker is already reachable inside WSL, the script now exits cleanly instead of forcing a second Docker install.

3. Inside Ubuntu WSL, bootstrap OpenClaw MAGI:

```bash
bash ./scripts/wsl/bootstrap-openclaw.sh
bash ./scripts/wsl/install-openclaw-magi-service.sh
```

The bootstrap script now installs `openclaw` if needed, copies the MAGI assets into `~/.openclaw-magi`, preserves existing workspace files, and builds the default sandbox image if it is missing.

4. Fill in `~/.openclaw-magi/gateway.env` from `.env.example`.

For the current all-OpenAI setup, `OPENCLAW_GATEWAY_PASSWORD` is required in that file. Model auth is handled through OpenClaw's ChatGPT/Codex OAuth flow instead of API keys.

5. Sign MAGI into OpenAI Codex:

```bash
bash ./scripts/wsl/login-openai-codex-all.sh
```

The helper uses one successful OpenAI/Codex login for `magi` and seeds the same auth profile to the other three seats.

6. Start the gateway:

```bash
systemctl --user start openclaw-magi.service
```

7. Open the Control UI:

```text
http://127.0.0.1:18790/
```

For other devices, use the Tailscale URL:

```text
https://homeserver.tailf7a295.ts.net:18790/
```

The current MAGI deployment is configured for a shared gateway password and does not require OpenClaw device pairing.

Heartbeat polling is explicitly disabled in the current MAGI config (`agents.defaults.heartbeat.every: "0m"`) to avoid unnecessary background token usage on this homeserver.

For a headless Windows server, also enable linger inside WSL and register a simple boot task that wakes the distro:

```bash
sudo loginctl enable-linger "$(whoami)"
```

```powershell
pwsh -File .\scripts\windows\register-openclaw-startup-task.ps1
```

Run the startup-task step from an elevated Windows PowerShell if you want the task to be created successfully.

## Discord

Discord is not enabled in the main config by default. Use `config/discord.overlay.example.json` as the phase-1.5 overlay and merge it into `~/.openclaw-magi/openclaw.json` once the Web UI flow is stable. The overlay binds Discord only to `magi`; the Control UI stays on the default `magi` agent.

## OpenAI Login Notes

OpenClaw supports OpenAI Codex OAuth for external tools, including OpenClaw workflows. This is the sign-in flow behind `openai-codex/*` models, and it stores refreshable auth profiles per agent under the active OpenClaw state directory.

Relevant docs:

- [OpenClaw OAuth](https://docs.openclaw.ai/concepts/oauth)
- [OpenClaw OpenAI provider](https://docs.openclaw.ai/providers/openai)

## Tool Policy Note

This build keeps a global `tools.profile: "minimal"` and extends individual agents with `tools.alsoAllow`.

That detail matters: under OpenClaw's tool-policy merge rules, `tools.allow` is intersected with the active profile, while `tools.alsoAllow` extends it. For MAGI, the council session tools such as `sessions_spawn`, `sessions_send`, and `sessions_history` must therefore be granted through `alsoAllow` or they will be clamped back down to the minimal profile.

## Council Cost Posture

The live MAGI contract now uses a tiered council instead of paying for the heaviest flow every time:

- `quick`: three real first opinions, low thinking, rebuttals only if there is strong disagreement or a veto signal
- `standard`: three real first opinions, low thinking, rebuttals only when the first round is materially unclear or risky
- `critical`: full council with rebuttals always on, and higher sub-agent thinking reserved for Melchior and Casper

This keeps normal questions cheap while still preserving a deep-review path for important decisions.

Important note: this is still a real three-seat council. The main cost saving comes from avoiding automatic rebuttal rounds and reserving higher reasoning for `critical` runs, not from faking the council or collapsing it into one agent.

## Service Map

The MAGI knowledge base now includes the current homeserver endpoints:

- MAGI: `https://homeserver.tailf7a295.ts.net:18790/` (tailnet only)
- Jellyfin: `https://homeserver.tailf7a295.ts.net:8443/web/#/home` (Tailscale Funnel / public)
- Nextcloud: `https://homeserver.tailf7a295.ts.net/apps/files/files`
- Pi-hole: `http://192.168.129.169:60123/admin/login` (LAN only)

These are recorded in `workspaces/magi/SERVER.md` so the council has the real host layout instead of placeholders.

## UI Track

A separate MAGI-themed frontend is planned as a parallel UI on its own port rather than a replacement for the stock OpenClaw Control UI.

- Current admin/debug UI stays on `18790`
- Planned themed UI target is `18810`
- The current migration notes live in `docs/ui-switch-plan.md`

The reference inspiration is [TomaszRewak/MAGI](https://github.com/TomaszRewak/MAGI), but the plan is to keep OpenClaw as the runtime and only replace the presentation layer.

### Current UI

The MAGI frontend in `ui/` is now a live control surface backed by `magi-ui-bridge.service`.

- Local URL: `http://127.0.0.1:18811/`
- Tailnet URL: `https://homeserver.tailf7a295.ts.net:18811/`
- Live features: seat state resolution, verdict inspection modal, runtime controls, diagnostics, and persisted run history

Run it locally with:

```bash
cd ui
npm install
npm run dev
```

Create a production build with:

```bash
cd ui
npm run build
```

## Primary References

- [OpenClaw install](https://docs.openclaw.ai/install)
- [OpenClaw Windows via WSL](https://docs.openclaw.ai/platforms/windows)
- [OpenClaw configuration reference](https://docs.openclaw.ai/gateway/configuration-reference)
- [OpenClaw multi-agent routing](https://docs.openclaw.ai/concepts/multi-agent)
- [OpenClaw multi-agent sandbox and tools](https://docs.openclaw.ai/tools/multi-agent-sandbox-tools)
- [OpenClaw OpenProse](https://docs.openclaw.ai/prose)
- [OpenClaw Discord](https://docs.openclaw.ai/channels/discord)
- [OpenClaw OpenAI provider](https://docs.openclaw.ai/openai)
- [OpenClaw Together provider](https://docs.openclaw.ai/providers/together)
- [OpenClaw DeepSeek provider](https://docs.openclaw.ai/providers/deepseek)
- [OpenAI GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4)
- [OpenAI GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [OpenAI GPT-5.4 nano](https://developers.openai.com/api/docs/models/gpt-5.4-nano)
- [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)

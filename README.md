# MAGI v1 for OpenClaw

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

For the current all-OpenAI setup, only `OPENCLAW_GATEWAY_TOKEN` is required in that file. Model auth is handled through OpenClaw's ChatGPT/Codex OAuth flow instead of API keys.

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

For a headless Windows server, also enable linger inside WSL and register a simple boot task that wakes the distro:

```bash
sudo loginctl enable-linger "$(whoami)"
```

```powershell
pwsh -File .\scripts\windows\register-openclaw-startup-task.ps1
```

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

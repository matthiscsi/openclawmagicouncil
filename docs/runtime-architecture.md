# Runtime Architecture: MAGI on WSL2 + OpenClaw + Docker

This document explains how your MAGI deployment actually works end-to-end.

## 1) What runs where

- Windows 11 host:
  - runs WSL2 (Ubuntu)
  - runs Docker Desktop engine integration used by OpenClaw sandbox containers
  - runs Tailscale client and Serve routes
- WSL2 Ubuntu user session:
  - `openclaw-magi.service` (gateway + council orchestration)
  - `magi-ui-bridge.service` (custom UI bridge/API)
  - agent state under `~/.openclaw-magi/state`

The actual LLM inference is remote (`openai-codex/gpt-5.4`), not local GPU inference.

## 2) Why Docker is involved

OpenClaw sandbox mode is configured as:

- backend: `docker`
- scope: `agent`
- network: `none`
- readOnlyRoot: `true`

So when a tool/action needs sandbox execution, OpenClaw starts a locked-down container (`openclaw-sandbox:bookworm-slim`) instead of running on the host shell directly.

This gives isolation boundaries:

- no direct host root access
- no outbound network by default for sandboxed runs
- bounded CPU/memory per sandbox

## 3) Request flow (custom UI path)

1. Browser opens custom UI (`18811`) via localhost or tailnet.
2. UI calls bridge API (`/api/council/evaluate`) with question + runtime options.
3. Bridge sends one message to `agent:magi:webui:<runId>` through gateway WebSocket.
4. MAGI spawns three internal seats (`melchior`, `balthasar`, `casper`).
5. Seats return structured JSON opinions.
6. MAGI synthesizes final decree.
7. Bridge polls state files and returns normalized seat + verdict status to UI.
8. UI renders seat states and final verdict modal.

## 4) State and persistence

- Agent/session state: `~/.openclaw-magi/state/agents/...`
- Custom run history: `~/.openclaw-magi/state/ui/run-history.jsonl`
- Runtime settings: browser localStorage (`magi-ui-runtime-settings`)

Refresh behavior:

- history persists (server-side JSONL)
- current unsent draft UI text does not

## 5) Services and exposure model

- OpenClaw control UI: `127.0.0.1:18790`
- Custom MAGI UI bridge: `127.0.0.1:18811`
- Tailnet exposure uses Tailscale Serve routes, not public raw bind.

Your current posture keeps MAGI tailnet/local unless explicitly funneled.

## 6) Failure modes you may see

- `gateway password mismatch`: bridge login/session credential issue
- `sessions_spawn timeout`: seat spawn call timed out; child may still finish later
- `degraded_mode=true`: one or more seats unavailable or errored

The bridge includes timeout grace logic before turning timeout into hard seat error.

## 7) Practical mental model

- OpenClaw gateway = orchestration brain
- Council seats = specialized reasoning workers
- Docker sandbox = execution containment boundary
- Bridge/UI = operator control surface
- External model provider = actual token compute

# MAGI Identity + Config Guide (Global and Per-Seat)

This is the practical baseline for your current deployment (all seats on OpenAI Codex OAuth), optimized for reliability and cost on your homeserver.

## What is actually needed

Required:

- `config/openclaw.json`
- `workspaces/magi/SOUL.md` + `workspaces/magi/AGENTS.md`
- `workspaces/melchior/SOUL.md` + `workspaces/melchior/AGENTS.md`
- `workspaces/balthasar/SOUL.md` + `workspaces/balthasar/AGENTS.md`
- `workspaces/casper/SOUL.md` + `workspaces/casper/AGENTS.md`
- `workspaces/magi/SERVER.md` for real host/service facts

Optional but useful:

- `workspaces/magi/JOURNAL.md` for durable operational memory
- `workspaces/magi/productivity.md` for operator preferences

Not needed in your current setup:

- a separate bootstrap prompt file
- a heartbeat worker
- always-on background seat chatter

## Best-practice split: global vs individual

Global defaults in `agents.defaults` should stay responsible for safety/cost:

- `skipBootstrap: true` (fast startup, no prompt bloat)
- `thinkingDefault: "low"` (cheap baseline)
- `heartbeat.every: "0m"` (no passive token burn)
- sandbox `backend: "docker"` + `network: "none"` + `readOnlyRoot: true`
- tight tool profile (`tools.profile: "minimal"`)

Per-agent overrides should encode identity and authority:

- `magi`: user-facing conductor, can execute only MAGI-scoped actions
- `melchior`: logic/architecture seat, read-only tools
- `balthasar`: operator-impact seat, read-only tools
- `casper`: red-team seat, read-only tools, veto authority via `critical-risk`

Rule of thumb:

- put runtime safety in `openclaw.json`
- put persona/behavior in `SOUL.md`
- put strict output contract in `AGENTS.md`

## Identity model by file

`SOUL.md` should define:

- seat role and tone
- optimization priorities
- host constraints awareness
- memory and heartbeat posture

`AGENTS.md` should define:

- required output schema
- stance semantics (`approve`, `revise`, `reject`)
- when to set `blocking_reason`
- execution recommendation semantics (`advisory`, `safe-execute`, `refuse`)

`SERVER.md` should define:

- actual hardware limits
- network and service topology
- MAGI-owned boundaries

## Memory policy (recommended)

Use 3-tier memory:

1. Session memory: implicit, per active run.
2. Durable operations memory: `JOURNAL.md` for incidents, decisions, and fixes.
3. Static environment memory: `SERVER.md` for host/services and boundaries.

Persist only items that improve future operations. Do not log every conversation.

## Heartbeat policy (recommended)

Keep heartbeat disabled (`every: "0m"`). Use explicit health checks instead:

- systemd service health (`systemctl --user status ...`)
- bridge `/api/health`
- gateway model probes only when troubleshooting

This avoids idle token usage and pointless background traffic.

## Bootstrap policy (recommended)

Your `skipBootstrap: true` posture is correct for this rig.

Reason:

- faster cold start
- fewer repeated tokens
- identity already lives in workspace files

Use a bootstrap script only for host setup (packages/services), not per-turn model prompting.

## Tools policy (recommended)

`magi`:

- allow council orchestration tools and MAGI admin adapter
- keep execution constrained to MAGI-owned files/processes

Council seats (`melchior`, `balthasar`, `casper`):

- read-only tools
- no broad shell/process tools
- no direct execution privileges

This keeps reasoning and action authority separated.

## How Docker fits in this OpenClaw setup

For your deployment, Docker is the execution sandbox layer for tools, not where the LLM lives.

Flow:

1. UI/bridge sends request to OpenClaw gateway.
2. `magi` runs council orchestration.
3. If an action is approved, OpenClaw runs the tool in a constrained Docker sandbox.
4. Sandbox writes only within allowed MAGI paths.
5. Result returns to gateway, then to UI.

Important:

- model inference/tokens happen at OpenAI (remote)
- Docker is local containment for tool execution
- WSL2 is the Linux runtime host for OpenClaw + Docker socket access

## Recommended current profile (all OpenAI)

- Keep all seats on `openai-codex/gpt-5.4` for now.
- Keep default `thinking` low.
- Let MAGI escalate to higher reasoning only in `critical` mode.
- Keep council rebuttals conditional in `quick`/`standard`; always-on in `critical`.
- Keep tailnet-only exposure and password auth.

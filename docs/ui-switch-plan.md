# Separate MAGI UI Plan

## Goal

Keep the current OpenClaw gateway and Control UI intact on `127.0.0.1:18790`, then add a separate MAGI-themed interface on a second port for a more thematic council experience.

## Why This Is a Parallel UI, Not a Replacement

- The current OpenClaw deployment already owns orchestration, seat spawning, auth, logs, Tailscale exposure, and execution policy.
- The reference project at [TomaszRewak/MAGI](https://github.com/TomaszRewak/MAGI) is a self-contained Python + Dash app that serves its own UI on port `8050` and expects direct OpenAI credentials.
- That means the safest path is to borrow the visual language and interaction patterns, not the original backend/runtime model.

## Reference Repo Notes

- Stack: Python 3, Dash, Mantine, legacy OpenAI Python client.
- UI pattern: one main verdict view, three seat panels, and drill-down visibility into each seat's answer.
- MAGI flavor worth borrowing: strong EVA theming, obvious seat identity, verdict-first layout, and visible disagreement instead of flattening everything into one chat bubble.

## Recommended Target Shape

- **Port `18790`**: keep the stock OpenClaw Control UI for admin/debug work.
- **Port `18810`**: add a separate MAGI-themed operator UI.
- **Exposure**: loopback on the host plus optional Tailscale Serve, same as the current gateway posture.
- **Auth**: reuse the current shared-password gateway auth model and avoid reintroducing per-device pairing in the parallel UI.

## Architecture Direction

### Preferred

- Build a lightweight web frontend in a dedicated `ui/` workspace.
- Put a thin local bridge in front of OpenClaw session data if the Control UI APIs are too coupled to reuse directly.
- Translate OpenClaw session state into a MAGI-specific view model:
  - parent council verdict
  - per-seat first opinion
  - rebuttal round
  - dissent summary
  - degraded mode
  - execution state

### Avoid

- Do not move the actual council logic into the new UI.
- Do not bypass OpenClaw auth by letting the browser hold provider credentials.
- Do not replace the existing Control UI until the parallel UI is feature-complete.

## Implementation Phases

1. Build a static mock UI shell on `18810` using hard-coded council JSON.
2. Define the bridge contract between OpenClaw session events and the new view model.
3. Render live council runs with seat cards, verdict state, and dissent details.
4. Add operator actions for safe workflows already supported by the gateway.
5. Publish it to the tailnet the same way the current Control UI is published.

## Repo Prep Done Here

- Reserved the idea of a dedicated second port (`18810`) for the themed UI track.
- Captured the migration direction in-repo so the UI work can start without re-discovering the architecture.
- Kept the plan separate from the current MAGI runtime so the existing deployment remains stable.

## Suggested Build Stack

- Frontend: React + Vite
- Bridge: small Node service running inside WSL beside the gateway
- Styling direction: borrow the EVA/MAGI visual language from the reference repo, but keep the runtime integration native to this OpenClaw deployment

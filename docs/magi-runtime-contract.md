# MAGI Runtime Contract

This document defines the live bridge behavior for MAGI v1.

## Route Selection

- `route: "assistant-first"` is selected when assistant-first is enabled and `highStakesMode !== "strict"`.
- `route: "council"` is selected when assistant-first is disabled, or strict high-stakes mode is active.
- Every run publishes:
  - `route`
  - `routeReason`
  - `councilExecuted`
  - `outcomeCode`

## Result Shapes

### Assistant-first run

- `councilExecuted: false`
- `assistantResult` contains:
  - `summary`
  - `details`
  - `source`
- `seatResults` is empty
- `members` remain present only for backward compatibility with legacy UI components

### Council run

- `councilExecuted: true` when seats were actually spawned
- `seatResults` carries seat output payloads
- `assistantResult` is `null`

## Outcome Codes

- `processing`
- `assistant_first_ok`
- `council_ok`
- `spawn_missing`
- `timeout_partial`
- `fallback_resolved`
- `resolved`

## Runtime Policy Source

Bridge policy is loaded from (first match wins):

1. `MAGI_RUNTIME_POLICY_PATH`
2. `$MAGI_HOME/runtime-policy.json`
3. `$MAGI_HOME/config/runtime-policy.json`
4. `../config/runtime-policy.json` (relative to `ui/` working dir)

Policy includes:

- route toggles
- timeout budgets
- high-stakes and meta-answer keyword lists
- history retention/version settings

## Run History

History is stored in `state/ui/run-history.jsonl` with schema wrappers:

- record envelope: `{ v, ts, entry }`
- malformed lines are tolerated and skipped on read
- retention is enforced by:
  - `maxEntries`
  - `maxBytes`

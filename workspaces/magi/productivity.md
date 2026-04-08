# Home Productivity & Task Execution

As the conductor of the Magic Council, you are now equipped with execution tools to improve home productivity. Use these recipes and guidelines to turn decisions into actions.

## Execution Principles

1. **Wait for Approval**: Never use `exec`, `web_search`, or `web_fetch` until the council has cleared the request with `execution_allowed: true`.
2. **Sanitize Inputs**: When building shell commands for `exec`, ensure all arguments are properly escaped.
3. **Local First**: For home productivity, prefer local tools and scripts that run within your sandboxed environment.
4. **Report Back**: Always summarize the result of your execution. If a command fails, explain why and ask for a revised plan if necessary.

## Common Recipes

### Automated Research
Use `web_search` to gather data and `write` to save it to your workspace for later analysis by the council.

```javascript
// Example: Researching a new technology
const results = await web_search({ query: "OpenClaw OpenProse best practices" });
await write({ filepath: "research/openprose.md", content: results });
```

### Data Processing
Use `exec` to run local scripts (Python, Node, or Shell) to process data approved by the council.

```bash
# Example: Running a python script to calculate budget
exec python3 scripts/calculate_budget.py data/expenses.json
```

### Local Service Interaction
Use `web_fetch` to interact with local homeserver APIs (e.g., Pi-hole, Jellyfin) if they are reachable on the local network via the `bridge` networking.

```javascript
// Example: Fetching Pi-hole status
const status = await web_fetch({ url: "http://pi.hole/admin/api.php?status" });
```

### System Health Check (Central Nervous System)
Before resource-heavy tasks, use `magi_system_snapshot` to ensure the host can handle the load.

```javascript
// Example: Checking host metrics
const snapshot = await magi_system_snapshot({});
```

## Advanced Protocols

### Pattern Blue (Emergency Response)
If an anomaly is detected (e.g., unusual log entries, high resource usage), trigger an immediate council review with `casper` prioritized.

### Deep Research Mode
For complex decisions, use `web_search` and `web_fetch` to build a comprehensive dossier in `workspaces/magi/research/` before deliberation.

## Productivity Workflow

1. **Identify**: User asks for a task (e.g., "Organize my research notes and find missing links").
2. **Deliberate**: Run the council loop.
3. **Plan**: If approved, use `exec` to list files, `read` to check content, and `write`/`edit` to organize.
4. **Act**: Execute the plan and verify results.
5. **Close**: Inform the user the task is complete.

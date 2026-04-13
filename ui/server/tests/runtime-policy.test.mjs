import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";

import { loadRuntimePolicy } from "../lib/runtime-policy.mjs";

test("runtime policy loads defaults when override file is missing", () => {
  const policy = loadRuntimePolicy({
    magiHome: path.join(os.tmpdir(), "missing-magi-home"),
    cwd: process.cwd(),
  });

  assert.equal(policy.routing.assistantFirstEnabled, true);
  assert.equal(policy.timeouts.runHardTimeoutMs > 0, true);
  assert.equal(policy.history.schemaVersion, 2);
});

test("runtime policy merges overrides from file", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "magi-policy-"));
  const policyPath = path.join(tempDir, "runtime-policy.json");

  await writeFile(
    policyPath,
    JSON.stringify({
      routing: {
        assistantFirstEnabled: false,
        directTimeoutMs: 12345,
      },
      history: {
        maxEntries: 42,
      },
    }),
    "utf8",
  );

  process.env.MAGI_RUNTIME_POLICY_PATH = policyPath;
  const policy = loadRuntimePolicy({
    magiHome: tempDir,
    cwd: process.cwd(),
  });
  delete process.env.MAGI_RUNTIME_POLICY_PATH;

  assert.equal(policy.routing.assistantFirstEnabled, false);
  assert.equal(policy.routing.directTimeoutMs, 12345);
  assert.equal(policy.history.maxEntries, 42);
  assert.equal(policy.timeouts.runHardTimeoutMs > 0, true);
});

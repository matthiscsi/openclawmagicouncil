import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";

import { appendHistoryEntry, readHistoryEntries } from "../lib/history-store.mjs";

test("history store appends, versions, and prunes entries", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "magi-history-"));
  const filePath = path.join(tempDir, "run-history.jsonl");

  for (let index = 0; index < 7; index += 1) {
    await appendHistoryEntry({
      filePath,
      entry: {
        id: `run-${index}`,
        question: `q-${index}`,
        createdAt: Date.now(),
        resolvedAt: Date.now(),
        isYesOrNoAnswerable: false,
        status: "info",
        decisionText: `decision-${index}`,
        dissentSummary: "",
        members: {
          melchior: "info",
          balthasar: "info",
          casper: "info",
        },
      },
      schemaVersion: 2,
      maxEntries: 5,
      maxBytes: 1024 * 1024,
    });
  }

  const entries = await readHistoryEntries(filePath, 10);
  assert.equal(entries.length, 5);
  assert.equal(entries[0].id, "run-6");
  assert.equal(entries[4].id, "run-2");
  assert.equal(entries[0].schemaVersion, 2);
});

test("history store tolerates malformed trailing lines", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "magi-history-malformed-"));
  const filePath = path.join(tempDir, "run-history.jsonl");

  await writeFile(
    filePath,
    [
      "{\"v\":2,\"entry\":{\"id\":\"ok-1\",\"question\":\"x\",\"createdAt\":1,\"resolvedAt\":2,\"isYesOrNoAnswerable\":false,\"status\":\"info\",\"decisionText\":\"ok\",\"dissentSummary\":\"\",\"members\":{\"melchior\":\"info\",\"balthasar\":\"info\",\"casper\":\"info\"}}}",
      "{not-json",
    ].join("\n"),
    "utf8",
  );

  const entries = await readHistoryEntries(filePath, 10);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "ok-1");
});

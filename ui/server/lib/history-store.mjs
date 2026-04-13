import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

function parseLine(line) {
  if (!line || !line.trim()) {
    return null;
  }

  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function normalizeHistoryEntry(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  if (record.entry && typeof record.entry === "object") {
    return {
      ...record.entry,
      schemaVersion: Number.isFinite(record.v) ? Number(record.v) : 1,
      loggedAt: Number.isFinite(record.ts) ? Number(record.ts) : Date.now(),
    };
  }

  if (typeof record.id === "string") {
    return {
      ...record,
      schemaVersion: 1,
      loggedAt: Date.now(),
    };
  }

  return null;
}

async function readRawLines(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const text = await readFile(filePath, "utf8");
    return text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  } catch {
    return [];
  }
}

function serializeRecords(records) {
  return records.map((record) => JSON.stringify(record)).join("\n") + "\n";
}

async function compactHistoryFile(filePath, records) {
  const tempFile = `${filePath}.tmp`;
  await writeFile(tempFile, serializeRecords(records), "utf8");
  await rename(tempFile, filePath);
}

export async function appendHistoryEntry({
  filePath,
  entry,
  schemaVersion = 2,
  maxEntries = 300,
  maxBytes = 1_500_000,
}) {
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    const wrapped = {
      v: schemaVersion,
      ts: Date.now(),
      entry,
    };

    await appendFile(filePath, `${JSON.stringify(wrapped)}\n`, "utf8");

    const lines = await readRawLines(filePath);
    if (lines.length <= maxEntries && Buffer.byteLength(lines.join("\n"), "utf8") <= maxBytes) {
      return;
    }

    const parsed = lines
      .map((line) => parseLine(line))
      .filter((record) => record && typeof record === "object");
    const bounded = parsed.slice(-maxEntries);
    let payload = serializeRecords(bounded);

    while (bounded.length > 1 && Buffer.byteLength(payload, "utf8") > maxBytes) {
      bounded.shift();
      payload = serializeRecords(bounded);
    }

    await compactHistoryFile(filePath, bounded);
  } catch {
    // History persistence should never break live responses.
  }
}

export async function readHistoryEntries(filePath, limit = 20) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 20;
  const lines = await readRawLines(filePath);
  const entries = lines
    .map((line) => parseLine(line))
    .map((record) => normalizeHistoryEntry(record))
    .filter((entry) => entry && typeof entry.id === "string");

  return entries.slice(-safeLimit).reverse();
}

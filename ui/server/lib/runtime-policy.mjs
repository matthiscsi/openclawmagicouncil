import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_RUNTIME_POLICY = {
  schemaVersion: 1,
  routing: {
    assistantFirstEnabled: true,
    repoReviewDirectTimeoutMs: 90000,
    directTimeoutMs: 20000,
    retryTimeoutMs: 90000,
  },
  timeouts: {
    gatewaySubmitMs: 45000,
    spawnTimeoutGraceMs: 120000,
    finalizationNudgeGraceMs: 30000,
    runHardTimeoutMs: 120000,
    runInfoTimeoutMs: 35000,
    runStallNudgeMs: 45000,
    runInfoStallNudgeMs: 15000,
  },
  history: {
    schemaVersion: 2,
    maxEntries: 300,
    maxBytes: 1_500_000,
  },
  lists: {
    highStakesKeywords: [
      "medical",
      "health",
      "legal",
      "law",
      "financial",
      "finance",
      "security",
      "privacy",
      "data loss",
      "backup",
      "public exposure",
      "credential",
      "password",
      "safety",
      "drug",
      "vaping",
    ],
    infoMetaPhrases: [
      "public weather source",
      "bounded lookup",
      "cannot be stated yet",
      "no direct weather data",
      "should perform",
      "cannot verify",
      "request is coherent",
      "correct dependency",
      "not derivable from local context",
      "subagent run",
      "lookup should",
      "should use a source",
      "give me a bit more detail",
      "desired output format",
      "i can help with that directly",
    ],
  },
};

function mergePolicy(base, incoming) {
  const output = { ...base };

  for (const [key, value] of Object.entries(incoming ?? {})) {
    if (Array.isArray(value)) {
      output[key] = [...value];
      continue;
    }

    if (value && typeof value === "object") {
      output[key] = mergePolicy(
        base[key] && typeof base[key] === "object" ? base[key] : {},
        value,
      );
      continue;
    }

    output[key] = value;
  }

  return output;
}

export function loadRuntimePolicy({ magiHome, cwd }) {
  const candidates = [
    process.env.MAGI_RUNTIME_POLICY_PATH,
    path.join(magiHome, "runtime-policy.json"),
    path.join(magiHome, "config", "runtime-policy.json"),
    path.resolve(cwd, "..", "config", "runtime-policy.json"),
  ].filter((value) => typeof value === "string" && value.trim());

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }

    try {
      const parsed = JSON.parse(readFileSync(candidate, "utf8"));
      return mergePolicy(DEFAULT_RUNTIME_POLICY, parsed);
    } catch {
      // Ignore malformed override file and continue with defaults.
    }
  }

  return { ...DEFAULT_RUNTIME_POLICY };
}

export { DEFAULT_RUNTIME_POLICY };

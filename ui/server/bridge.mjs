import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";

const MAGI_HOME = process.env.MAGI_HOME ?? path.join(os.homedir(), ".openclaw-magi");
const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(MAGI_HOME, "state");
const CONFIG_PATH = process.env.OPENCLAW_CONFIG_PATH ?? path.join(MAGI_HOME, "openclaw.json");
const GATEWAY_URL = process.env.MAGI_GATEWAY_URL ?? "ws://127.0.0.1:18790";
const BRIDGE_PORT = Number.parseInt(process.env.MAGI_UI_BRIDGE_PORT ?? "18811", 10);
const STATIC_DIR = process.env.MAGI_UI_STATIC_DIR ?? path.join(process.cwd(), "dist");
const OPENCLAW_DIST_DIR = path.join(
  os.homedir(),
  ".npm-global",
  "lib",
  "node_modules",
  "openclaw",
  "dist",
);
const OPENCLAW_CALL_PATH = process.env.MAGI_OPENCLAW_CALL_PATH ?? null;
const UI_STATE_DIR = path.join(STATE_DIR, "ui");
const RUN_HISTORY_PATH = path.join(UI_STATE_DIR, "run-history.jsonl");

const SESSION_COOKIE_NAME = "magi_bridge_sid";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const DEFAULT_MAGI_SESSION_KEY = "agent:magi:main";
const MEMBER_IDS = ["melchior", "balthasar", "casper"];
const DEFAULT_RUNTIME_OPTIONS = {
  councilMode: "auto",
  reasoningEffort: "auto",
  responseStyle: "balanced",
  executionPolicy: "advisory",
  highStakesMode: "normal",
};
const SPAWN_TIMEOUT_GRACE_MS = 120000;
const HIGH_STAKES_KEYWORDS = [
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
];
const ALLOWED_DEV_ORIGINS = new Set([
  "http://127.0.0.1:18810",
  "http://localhost:18810",
  "http://192.168.129.169:18810",
  "http://100.100.237.73:18810",
  "https://homeserver.tailf7a295.ts.net:18810",
]);

const authSessions = new Map();
const runs = new Map();

let gatewayCallerPromise;

function json(value) {
  return JSON.stringify(value);
}

function now() {
  return Date.now();
}

function toTitleCase(value) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeLabel(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function parseCookies(header) {
  const cookies = {};
  for (const chunk of (header ?? "").split(";")) {
    const [rawKey, ...rawValue] = chunk.trim().split("=");
    if (!rawKey) {
      continue;
    }

    cookies[rawKey] = decodeURIComponent(rawValue.join("="));
  }

  return cookies;
}

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;

  if (origin && ALLOWED_DEV_ORIGINS.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Vary", "Origin");
  }
}

function setJsonHeaders(request, response, status = 200) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  setCorsHeaders(request, response);
}

function sendJson(request, response, status, payload) {
  setJsonHeaders(request, response, status);
  response.end(json(payload));
}

function sendEmpty(request, response, status = 204) {
  response.statusCode = status;
  setCorsHeaders(request, response);
  response.end();
}

function setAuthCookie(response, sessionId) {
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  );
}

function clearAuthCookie(response) {
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
  );
}

function cleanupExpiredAuthSessions() {
  const cutoff = now() - SESSION_TTL_MS;

  for (const [sessionId, session] of authSessions.entries()) {
    if (session.createdAt < cutoff) {
      authSessions.delete(sessionId);
    }
  }
}

function getAuthSession(request) {
  cleanupExpiredAuthSessions();
  const cookies = parseCookies(request.headers.cookie);
  const sessionId = cookies[SESSION_COOKIE_NAME];

  if (!sessionId) {
    return null;
  }

  return authSessions.get(sessionId) ?? null;
}

async function readBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();

  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

async function getGatewayCaller() {
  if (!gatewayCallerPromise) {
    gatewayCallerPromise = (async () => {
      const candidatePaths = [];

      if (OPENCLAW_CALL_PATH) {
        candidatePaths.push(OPENCLAW_CALL_PATH);
      }

      const distEntries = await readdir(OPENCLAW_DIST_DIR);
      const discoveredCandidates = distEntries
        .filter((entry) => /^call-(?!status).+\.js$/i.test(entry))
        .sort()
        .map((entry) => path.join(OPENCLAW_DIST_DIR, entry));

      for (const discoveredPath of discoveredCandidates) {
        if (!candidatePaths.includes(discoveredPath)) {
          candidatePaths.push(discoveredPath);
        }
      }

      let lastError = null;

      for (const candidatePath of candidatePaths) {
        try {
          const module = await import(pathToFileURL(candidatePath).href);

          if (typeof module.r === "function") {
            return module.r;
          }
        } catch (error) {
          lastError = error;
        }
      }

      if (lastError instanceof Error) {
        throw lastError;
      }

      throw new Error("OpenClaw gateway caller was not found in the installed runtime.");
    })();
  }

  return gatewayCallerPromise;
}

async function callGateway(method, params, password, extra = {}) {
  const gatewayCall = await getGatewayCaller();

  return gatewayCall({
    method,
    params,
    password,
    url: GATEWAY_URL,
    configPath: CONFIG_PATH,
    expectFinal: extra.expectFinal,
    clientName: "gateway-client",
    clientDisplayName: "MAGI UI Bridge",
    clientVersion: "0.1.0",
    mode: "backend",
  });
}

async function verifyGatewayPassword(password) {
  if (typeof password !== "string" || password.trim().length === 0) {
    return false;
  }

  try {
    await callGateway("health", {}, password.trim());
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath, fallback) {
  try {
    const text = await readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function readJsonLines(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    return text
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function appendRunHistory(entry) {
  try {
    await mkdir(UI_STATE_DIR, { recursive: true });
    await appendFile(RUN_HISTORY_PATH, `${json(entry)}\n`, "utf8");
  } catch {
    // History persistence should not block live response flow.
  }
}

async function readRunHistory(limit = 20) {
  const lines = await readJsonLines(RUN_HISTORY_PATH);
  const cleanLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 20;
  return lines
    .filter((entry) => typeof entry?.id === "string")
    .slice(-cleanLimit)
    .reverse();
}

async function getMagiSessionRecord(sessionKey = DEFAULT_MAGI_SESSION_KEY) {
  const record = await getAgentSessionRecord("magi", sessionKey);

  if (!record?.sessionId) {
    return null;
  }

  return {
    sessionKey,
    sessionId: record.sessionId,
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : null,
    filePath: record.filePath,
  };
}

async function getBaselineSnapshot(sessionKey = DEFAULT_MAGI_SESSION_KEY) {
  const record = await getMagiSessionRecord(sessionKey);

  if (!record || !existsSync(record.filePath)) {
    return {
      sessionId: null,
      lineCount: 0,
    };
  }

  const lines = await readJsonLines(record.filePath);

  return {
    sessionId: record.sessionId,
    lineCount: lines.length,
  };
}

function classifyQuestion(question) {
  const lower = question.trim().toLowerCase();

  if (
    lower.startsWith("what ")
    || lower.startsWith("how ")
    || lower.startsWith("why ")
    || lower.startsWith("when ")
    || lower.startsWith("where ")
    || lower.startsWith("who ")
    || lower.startsWith("which ")
    || /\b(explain|describe|summarize|tradeoff|tradeoffs|compare)\b/.test(lower)
  ) {
    return false;
  }

  return (
    lower.startsWith("should ")
    || lower.startsWith("is ")
    || lower.startsWith("are ")
    || lower.startsWith("can ")
    || lower.startsWith("could ")
    || lower.startsWith("would ")
    || lower.startsWith("will ")
    || lower.startsWith("do ")
    || lower.startsWith("does ")
    || lower.startsWith("did ")
    || lower.startsWith("has ")
    || lower.startsWith("have ")
    || lower.startsWith("had ")
    || lower.startsWith("am ")
    || lower.startsWith("was ")
    || lower.startsWith("were ")
    || lower.endsWith("?")
  );
}

function normalizeRuntimeOptions(rawOptions) {
  const options = rawOptions && typeof rawOptions === "object" ? rawOptions : {};

  const councilMode = ["auto", "quick", "standard", "critical"].includes(options.councilMode)
    ? options.councilMode
    : DEFAULT_RUNTIME_OPTIONS.councilMode;
  const reasoningEffort = ["auto", "low", "medium", "high"].includes(options.reasoningEffort)
    ? options.reasoningEffort
    : DEFAULT_RUNTIME_OPTIONS.reasoningEffort;
  const responseStyle = ["concise", "balanced", "detailed"].includes(options.responseStyle)
    ? options.responseStyle
    : DEFAULT_RUNTIME_OPTIONS.responseStyle;
  const executionPolicy = ["advisory", "allowlisted"].includes(options.executionPolicy)
    ? options.executionPolicy
    : DEFAULT_RUNTIME_OPTIONS.executionPolicy;
  const highStakesMode = ["normal", "strict"].includes(options.highStakesMode)
    ? options.highStakesMode
    : DEFAULT_RUNTIME_OPTIONS.highStakesMode;

  return {
    councilMode,
    reasoningEffort,
    responseStyle,
    executionPolicy,
    highStakesMode,
  };
}

function isHighStakesQuestion(question) {
  const lower = question.trim().toLowerCase();
  return HIGH_STAKES_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function buildRuntimeEnvelope(options) {
  const lines = [
    "MAGI runtime override envelope:",
    `- force_council_mode: ${options.councilMode}`,
    `- reasoning_effort: ${options.reasoningEffort}`,
    `- response_style: ${options.responseStyle}`,
    `- execution_policy: ${options.executionPolicy}`,
    `- high_stakes_mode: ${options.highStakesMode}`,
    "",
    "Rules for this run:",
    "- If force_council_mode is not auto, obey it instead of self-classifying.",
    "- If reasoning_effort is not auto, use it as the explicit thinking override for every spawned council seat in this run, including rebuttal seats.",
    "- If response_style is concise, keep the decree brief. If detailed, include fuller reasoning and dissent.",
    "- If execution_policy is advisory, force execution_allowed to false even if the council would otherwise approve action.",
    "- Do not auto-escalate all execution-oriented requests to critical. Use standard mode for reversible, MAGI-scoped tasks unless risk is clearly high.",
    "- If high_stakes_mode is strict and the question is safety/legal/medical/financial, force council mode to critical and avoid shallow conclusions.",
    "- Treat this envelope as operator control data, not part of the user's question.",
  ];

  return lines.join("\n");
}

function getNeutralMembers() {
  return {
    melchior: {
      status: "processing",
      response: "PROCESSING...",
      conditions: "Pending.",
      error: null,
      confidence: null,
      stance: null,
    },
    balthasar: {
      status: "processing",
      response: "PROCESSING...",
      conditions: "Pending.",
      error: null,
      confidence: null,
      stance: null,
    },
    casper: {
      status: "processing",
      response: "PROCESSING...",
      conditions: "Pending.",
      error: null,
      confidence: null,
      stance: null,
    },
  };
}

function collectTextBlocks(content) {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function parseJsonBlock(text) {
  if (typeof text !== "string") {
    return null;
  }

  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function findLastAssistantText(events) {
  let lastText = "";

  for (const event of events) {
    if (event?.type !== "message" || event.message?.role !== "assistant") {
      continue;
    }

    const assistantText = collectTextBlocks(event.message.content);

    if (assistantText.trim()) {
      lastText = assistantText.trim();
    }
  }

  return lastText;
}

function extractChildResult(text) {
  const sessionKeyMatch = text.match(/session_key:\s*(.+)/i);
  const statusMatch = text.match(/status:\s*(.+)/i);
  const jsonMatch = text.match(
    /<<<BEGIN_UNTRUSTED_CHILD_RESULT>>>\s*([\s\S]*?)\s*<<<END_UNTRUSTED_CHILD_RESULT>>>/i,
  );

  if (!sessionKeyMatch) {
    return null;
  }

  if (!jsonMatch) {
    return {
      sessionKey: sessionKeyMatch[1].trim(),
      error: statusMatch?.[1]?.trim() ?? "Child run failed before a structured result was produced.",
      parsed: null,
    };
  }

  try {
    return {
      sessionKey: sessionKeyMatch[1].trim(),
      error: null,
      parsed: JSON.parse(jsonMatch[1]),
    };
  } catch {
    return {
      sessionKey: sessionKeyMatch[1].trim(),
      error: "The child result could not be parsed as JSON.",
      parsed: null,
    };
  }
}

function memberIdFromSessionKey(sessionKey) {
  const match = sessionKey.match(/^agent:(melchior|balthasar|casper):/i);
  return match ? match[1].toLowerCase() : null;
}

function describeSeatStance(stance, status) {
  const normalizedStance = normalizeLabel(stance);

  if (["revise", "conditional", "mixed", "caution"].includes(normalizedStance)) {
    return "qualified answer with caveats";
  }

  if (["approve", "support", "yes"].includes(normalizedStance) || status === "yes") {
    return "yes";
  }

  if (["refuse", "reject", "deny", "no"].includes(normalizedStance) || status === "no") {
    return "no";
  }

  if (status === "info") {
    return "informational analysis";
  }

  if (status === "error") {
    return "seat error";
  }

  return normalizedStance || status;
}

function mapStanceToStatus(result, isYesOrNoAnswerable) {
  if (!isYesOrNoAnswerable) {
    return "info";
  }

  const stance = normalizeLabel(result?.stance);
  const blockingReason = normalizeLabel(result?.blocking_reason);
  const recommendation = normalizeLabel(result?.action_recommendation);

  if (
    blockingReason.includes("critical")
    || ["refuse", "reject", "deny", "no"].includes(stance)
    || ["refuse", "deny"].includes(recommendation)
  ) {
    return "no";
  }

  if (
    ["revise", "conditional", "mixed", "caution"].includes(stance)
    || (blockingReason && blockingReason !== "none")
  ) {
    return "conditional";
  }

  if (["approve", "support", "yes"].includes(stance)) {
    return "yes";
  }

  return "conditional";
}

function formatMemberConditions(result) {
  const parts = [];

  if (typeof result?.action_recommendation === "string" && result.action_recommendation.trim()) {
    parts.push(`ACTION: ${result.action_recommendation.trim().toUpperCase()}`);
  }

  if (typeof result?.blocking_reason === "string" && result.blocking_reason.trim()) {
    parts.push(`BLOCK: ${result.blocking_reason.trim().toUpperCase()}`);
  }

  return parts.length > 0 ? parts.join(" | ") : "None.";
}

function formatMemberResponse(result) {
  const lines = [];

  if (typeof result?.stance === "string" && result.stance.trim()) {
    lines.push(`STANCE: ${result.stance.trim().toUpperCase()}`);
  }

  if (typeof result?.confidence === "number") {
    lines.push(`CONFIDENCE: ${result.confidence.toFixed(2)}`);
  }

  if (Array.isArray(result?.key_points) && result.key_points.length > 0) {
    lines.push("KEY POINTS:");
    for (const point of result.key_points) {
      lines.push(`- ${point}`);
    }
  }

  if (Array.isArray(result?.risks) && result.risks.length > 0) {
    lines.push("RISKS:");
    for (const risk of result.risks) {
      lines.push(`- ${risk}`);
    }
  }

  return lines.join("\n");
}

function buildMemberSnapshot(payload, isYesOrNoAnswerable) {
  if (payload.error) {
    return {
      status: "error",
      response: "No structured council answer was produced.",
      conditions: "Run terminated before the seat returned a valid result.",
      error: payload.error,
      confidence: null,
      stance: null,
    };
  }

  const result = payload.parsed;

  return {
    status: mapStanceToStatus(result, isYesOrNoAnswerable),
    response: formatMemberResponse(result),
    conditions: formatMemberConditions(result),
    error: null,
    confidence: typeof result?.confidence === "number" ? result.confidence : null,
    stance: typeof result?.stance === "string" ? result.stance : null,
  };
}

function aggregateCouncilStatus(statuses, isYesOrNoAnswerable) {
  if (statuses.some((status) => status === "error")) {
    return "error";
  }

  if (!isYesOrNoAnswerable) {
    return "info";
  }

  if (statuses.some((status) => status === "no")) {
    return "no";
  }

  if (statuses.some((status) => status === "conditional")) {
    return "conditional";
  }

  return "yes";
}

function captureVerdictSection(fullText, key, nextKeys) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedNext = nextKeys
    .map((entry) => entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const pattern = escapedNext.length > 0
    ? new RegExp(`^${escapedKey}:\\s*([\\s\\S]*?)(?=^(${escapedNext}):|$)`, "im")
    : new RegExp(`^${escapedKey}:\\s*([\\s\\S]*?)$`, "im");
  const match = fullText.match(pattern);
  return match ? match[1].trim() : "";
}

function parseFinalVerdict(fullText) {
  const decisionText = captureVerdictSection(fullText, "decision", [
    "dissent_summary",
    "degraded_mode",
    "execution_allowed",
    "execution_plan",
    "reasoning_summary",
  ]);
  const dissentSummary = captureVerdictSection(fullText, "dissent_summary", [
    "degraded_mode",
    "execution_allowed",
    "execution_plan",
    "reasoning_summary",
  ]);

  return {
    decisionText: decisionText || fullText.trim(),
    dissentSummary,
    fullText: fullText.trim(),
  };
}

function isFinalAssistantText(text) {
  const trimmed = text.trim();

  if (!trimmed || trimmed === "NO_REPLY") {
    return false;
  }

  if (trimmed.includes("MAGI update:")) {
    return false;
  }

  return trimmed.includes("decision:") || trimmed.includes("MAGI verdict");
}

async function getAgentSessionRecord(agentId, sessionKey) {
  const sessionsPath = path.join(STATE_DIR, "agents", agentId, "sessions", "sessions.json");
  const sessions = await readJsonFile(sessionsPath, {});
  const record = sessions?.[sessionKey];

  if (!record?.sessionId) {
    return null;
  }

  return {
    ...record,
    sessionId: record.sessionId,
    filePath: record.sessionFile
      ?? path.join(STATE_DIR, "agents", agentId, "sessions", `${record.sessionId}.jsonl`),
  };
}

function findPromptError(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event?.type === "custom" && event.customType === "openclaw:prompt-error") {
      return typeof event.data?.error === "string" ? event.data.error : "The seat run failed.";
    }

    if (
      event?.type === "message"
      && event.message?.role === "assistant"
      && typeof event.message?.errorMessage === "string"
      && event.message.errorMessage.trim()
    ) {
      return event.message.errorMessage.trim();
    }
  }

  return null;
}

function findChildStructuredResult(events) {
  const lastAssistantText = findLastAssistantText(events);
  const parsed = parseJsonBlock(lastAssistantText);

  if (parsed && typeof parsed === "object") {
    return parsed;
  }

  return null;
}

async function readMemberStateFromChildSession(memberId, childSessionKey, isYesOrNoAnswerable) {
  const record = await getAgentSessionRecord(memberId, childSessionKey);

  if (!record) {
    return null;
  }

  if (!existsSync(record.filePath)) {
    return {
      status: "processing",
      response: "PROCESSING...",
      conditions: "Pending.",
      error: null,
      confidence: null,
      stance: null,
    };
  }

  const events = await readJsonLines(record.filePath);
  const parsedResult = findChildStructuredResult(events);

  if (parsedResult) {
    return buildMemberSnapshot(
      {
        parsed: parsedResult,
        error: null,
      },
      isYesOrNoAnswerable,
    );
  }

  if (record.status === "timeout") {
    return {
      status: "error",
      response: "No structured council answer was produced.",
      conditions: "Seat timed out before a final opinion could be delivered.",
      error: findPromptError(events) ?? "The seat timed out.",
      confidence: null,
      stance: null,
    };
  }

  if (record.status === "done") {
    return {
      status: "error",
      response: "No structured council answer was produced.",
      conditions: "The seat finished without returning a valid council payload.",
      error: findPromptError(events) ?? "Structured council output was missing.",
      confidence: null,
      stance: null,
    };
  }

  return {
    status: "processing",
    response: "PROCESSING...",
    conditions: "Pending.",
    error: null,
    confidence: null,
    stance: null,
  };
}

function synthesizeDecisionText(status, members, isYesOrNoAnswerable) {
  if (!isYesOrNoAnswerable) {
    return "Informational query. The council is returning analysis rather than a yes/no decree.";
  }

  switch (status) {
    case "error":
      return "Council degraded. One or more seats failed to return a usable opinion, so this result is advisory only.";
    case "no":
      return "Council rejection. At least one seat returned a direct no.";
    case "conditional":
      return "Council qualified. No seat rejected outright, but at least one seat returned a caveated answer instead of an unconditional yes.";
    case "yes":
      return "Council approval. All three seats returned unconditional yes.";
    case "info":
    default:
      return "Council returned informational analysis instead of a binary decree.";
  }
}

function synthesizeDissentSummary(members) {
  const lines = [];

  for (const memberId of MEMBER_IDS) {
    const member = members[memberId];

    if (member.status === "processing") {
      continue;
    }

    if (member.status === "error") {
      lines.push(`${toTitleCase(memberId)} failed to return a usable opinion.`);
      continue;
    }

    const stance = describeSeatStance(member.stance, member.status);
    const conditions = member.conditions?.trim();
    lines.push(
      `${toTitleCase(memberId)}: ${stance}${conditions && conditions !== "None." ? ` (${conditions})` : ""}`,
    );
  }

  return lines.join(" ");
}

async function buildRunSnapshot(run) {
  const members = getNeutralMembers();
  const currentSession = await getMagiSessionRecord(run.sessionKey);

  if (!currentSession || !existsSync(currentSession.filePath)) {
    return {
      id: run.id,
      question: run.question,
      isYesOrNoAnswerable: run.isYesOrNoAnswerable,
      sessionId: null,
      members,
      aggregation: {
        status: "processing",
        decisionText: "",
        dissentSummary: "",
        fullText: "",
      },
      phase: "member_processing",
      resolved: false,
    };
  }

  const events = await readJsonLines(currentSession.filePath);
  const relevantEvents = run.baseline.sessionId === currentSession.sessionId
    ? events.slice(run.baseline.lineCount)
    : events;
  const toolCallMap = new Map();
  const childSessionKeys = new Map();
  const spawnErrors = new Map();
  let finalText = "";

  for (const event of relevantEvents) {
    if (event?.type !== "message" || !event.message) {
      continue;
    }

    const message = event.message;

    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (const contentItem of message.content) {
        if (
          contentItem?.type === "toolCall"
          && contentItem.name === "sessions_spawn"
          && typeof contentItem.id === "string"
        ) {
          const agentId = normalizeLabel(contentItem.arguments?.agentId);

          if (MEMBER_IDS.includes(agentId)) {
            toolCallMap.set(contentItem.id, agentId);
          }
        }
      }

      const assistantText = collectTextBlocks(message.content);

      if (isFinalAssistantText(assistantText)) {
        finalText = assistantText;
      }
    }

    if (message.role === "toolResult" && message.toolName === "sessions_spawn") {
      const memberId = toolCallMap.get(message.toolCallId);

      if (!memberId) {
        continue;
      }

      const childSessionKey = typeof message.details?.childSessionKey === "string"
        ? message.details.childSessionKey
        : null;
      const spawnStatus = normalizeLabel(message.details?.status);

      if (childSessionKey) {
        childSessionKeys.set(memberId, childSessionKey);
      }

      if (message.isError || spawnStatus === "error") {
        spawnErrors.set(
          memberId,
          collectTextBlocks(message.content)
            || (typeof message.details?.error === "string" ? message.details.error : "Seat launch failed."),
        );
      }

      if (message.isError && !childSessionKey) {
        members[memberId] = {
          status: "error",
          response: "The seat failed before it could provide an opinion.",
          conditions: "Spawn request failed.",
          error: collectTextBlocks(message.content) || "Seat launch failed.",
          confidence: null,
          stance: null,
        };
      }
    }

    if (message.role === "user") {
      const userText = collectTextBlocks(message.content);
      const childResult = extractChildResult(userText);

      if (!childResult) {
        continue;
      }

      const memberId = memberIdFromSessionKey(childResult.sessionKey);

      if (memberId && MEMBER_IDS.includes(memberId)) {
        members[memberId] = buildMemberSnapshot(childResult, run.isYesOrNoAnswerable);
      }
    }
  }

  for (const memberId of MEMBER_IDS) {
    const spawnError = spawnErrors.get(memberId) ?? null;

    if (childSessionKeys.has(memberId)) {
      const liveMemberState = await readMemberStateFromChildSession(
        memberId,
        childSessionKeys.get(memberId),
        run.isYesOrNoAnswerable,
      );

      if (liveMemberState && (liveMemberState.status !== "processing" || !spawnError)) {
        members[memberId] = liveMemberState;
        continue;
      }
    }

    if (spawnError) {
      const shouldHoldForChildGrace = childSessionKeys.has(memberId)
        && (now() - run.createdAt) < SPAWN_TIMEOUT_GRACE_MS;

      if (shouldHoldForChildGrace) {
        members[memberId] = {
          status: "processing",
          response: "Awaiting child seat completion after a spawn timeout signal.",
          conditions: "Timeout grace window active.",
          error: null,
          confidence: null,
          stance: null,
        };
        continue;
      }

      members[memberId] = {
        status: "error",
        response: "The seat failed before it could provide an opinion.",
        conditions: "Spawn request failed.",
        error: spawnError,
        confidence: null,
        stance: null,
      };
    }
  }

  const statuses = MEMBER_IDS.map((memberId) => members[memberId].status);
  const allMembersResolved = statuses.every((status) =>
    ["yes", "no", "conditional", "info", "error"].includes(status)
  );
  const aggregatedStatus = allMembersResolved
    ? aggregateCouncilStatus(statuses, run.isYesOrNoAnswerable)
    : "processing";
  const aggregation = finalText
    ? {
      status: aggregatedStatus,
      ...parseFinalVerdict(finalText),
    }
    : allMembersResolved
      ? {
        status: aggregatedStatus,
        decisionText: synthesizeDecisionText(aggregatedStatus, members, run.isYesOrNoAnswerable),
        dissentSummary: synthesizeDissentSummary(members),
        fullText: synthesizeDecisionText(aggregatedStatus, members, run.isYesOrNoAnswerable),
      }
    : {
      status: "processing",
      decisionText: "",
      dissentSummary: "",
      fullText: "",
    };

  const snapshot = {
    id: run.id,
    question: run.question,
    isYesOrNoAnswerable: run.isYesOrNoAnswerable,
    sessionId: currentSession.sessionId,
    members,
    aggregation,
    phase: allMembersResolved ? "resolved" : "member_processing",
    resolved: allMembersResolved,
  };

  if (snapshot.resolved && !run.historyLogged) {
    run.historyLogged = true;
    await appendRunHistory({
      id: run.id,
      question: run.question,
      createdAt: run.createdAt,
      resolvedAt: now(),
      isYesOrNoAnswerable: run.isYesOrNoAnswerable,
      status: snapshot.aggregation.status,
      decisionText: snapshot.aggregation.decisionText,
      dissentSummary: snapshot.aggregation.dissentSummary,
      members: {
        melchior: snapshot.members.melchior.status,
        balthasar: snapshot.members.balthasar.status,
        casper: snapshot.members.casper.status,
      },
    });
  }

  return snapshot;
}

function getMimeType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  if (filePath.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

async function serveStatic(request, response, pathname) {
  if (!existsSync(STATIC_DIR)) {
    sendJson(request, response, 404, { error: "Static UI bundle not found." });
    return;
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidatePath = path.join(STATIC_DIR, relativePath);
  const normalizedCandidate = path.normalize(candidatePath);
  const normalizedRoot = path.normalize(STATIC_DIR);
  const filePath = normalizedCandidate.startsWith(normalizedRoot) && existsSync(normalizedCandidate)
    ? normalizedCandidate
    : path.join(STATIC_DIR, "index.html");

  try {
    const body = await readFile(filePath);
    response.statusCode = 200;
    response.setHeader("Content-Type", getMimeType(filePath));
    response.end(body);
  } catch {
    sendJson(request, response, 404, { error: "Requested UI asset was not found." });
  }
}

async function handleApiRequest(request, response, pathname) {
  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    setCorsHeaders(request, response);
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.end();
    return;
  }

  if (request.method === "GET" && pathname === "/api/health") {
    sendJson(request, response, 200, {
      bridge: "online",
      gatewayUrl: GATEWAY_URL,
      staticServing: existsSync(STATIC_DIR),
    });
    return;
  }

  if (request.method === "GET" && pathname === "/api/diagnostics") {
    try {
      const authSession = getAuthSession(request);
      const gatewayReachable = authSession
        ? await verifyGatewayPassword(authSession.password)
        : false;

      const seatStatus = {};
      for (const seatId of MEMBER_IDS) {
        const sessionsPath = path.join(STATE_DIR, "agents", seatId, "sessions", "sessions.json");
        const sessions = await readJsonFile(sessionsPath, {});
        const entries = Object.entries(sessions)
          .filter(([sessionKey]) => typeof sessionKey === "string" && sessionKey.startsWith(`agent:${seatId}:`))
          .map(([sessionKey, record]) => ({
            sessionKey,
            updatedAt: typeof record?.updatedAt === "number" ? record.updatedAt : null,
            status: typeof record?.status === "string" ? record.status : null,
          }))
          .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

        const latest = entries[0] ?? null;
        seatStatus[seatId] = {
          known: Boolean(latest),
          updatedAt: latest?.updatedAt ?? null,
          sessionKey: latest?.sessionKey ?? null,
          status: latest?.status ?? null,
        };
      }

      sendJson(request, response, 200, {
        bridge: "online",
        gatewayReachable,
        seatStatus,
      });
    } catch (error) {
      sendJson(request, response, 500, {
        error: error instanceof Error ? error.message : "Failed to collect bridge diagnostics.",
      });
    }
    return;
  }

  if (request.method === "POST" && pathname === "/api/auth/login") {
    try {
      const body = await readBody(request);
      const password = typeof body.password === "string" ? body.password.trim() : "";
      const ok = await verifyGatewayPassword(password);

      if (!ok) {
        sendJson(request, response, 401, {
          ok: false,
          error: "Gateway password was rejected.",
        });
        return;
      }

      const sessionId = crypto.randomUUID();
      authSessions.set(sessionId, {
        password,
        createdAt: now(),
      });
      setAuthCookie(response, sessionId);
      sendJson(request, response, 200, {
        ok: true,
        authenticated: true,
      });
    } catch (error) {
      sendJson(request, response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : "Login failed.",
      });
    }
    return;
  }

  if (request.method === "POST" && pathname === "/api/auth/logout") {
    const cookies = parseCookies(request.headers.cookie);
    const sessionId = cookies[SESSION_COOKIE_NAME];

    if (sessionId) {
      authSessions.delete(sessionId);
    }

    clearAuthCookie(response);
    sendJson(request, response, 200, {
      ok: true,
      authenticated: false,
    });
    return;
  }

  if (request.method === "GET" && pathname === "/api/auth/session") {
    const session = getAuthSession(request);

    if (!session) {
      sendJson(request, response, 200, {
        authenticated: false,
      });
      return;
    }

    sendJson(request, response, 200, {
      authenticated: true,
    });
    return;
  }

  const authSession = getAuthSession(request);

  if (!authSession) {
    sendJson(request, response, 401, {
      error: "Authentication required.",
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/council/evaluate") {
    try {
      const body = await readBody(request);
      const question = typeof body.question === "string" ? body.question.trim() : "";
      const normalizedOptions = normalizeRuntimeOptions(body.options);

      if (!question) {
        sendJson(request, response, 400, {
          error: "A question is required.",
        });
        return;
      }

      const shouldForceCritical = normalizedOptions.highStakesMode === "strict"
        && isHighStakesQuestion(question);
      const options = shouldForceCritical
        ? { ...normalizedOptions, councilMode: "critical" }
        : normalizedOptions;

      const runId = crypto.randomUUID();
      const sessionKey = `agent:magi:webui:${runId}`;
      const baseline = await getBaselineSnapshot(sessionKey);
      const runtimeEnvelope = buildRuntimeEnvelope(options);
      const run = {
        id: runId,
        sessionKey,
        question,
        options,
        isYesOrNoAnswerable: classifyQuestion(question),
        baseline,
        createdAt: now(),
      };
      runs.set(runId, run);

      await callGateway(
        "chat.send",
        {
          sessionKey: run.sessionKey,
          message: `${runtimeEnvelope}\n\nUser question:\n${question}`,
          deliver: false,
          idempotencyKey: crypto.randomUUID(),
        },
        authSession.password,
        { expectFinal: false },
      );

      sendJson(request, response, 200, {
        id: runId,
        question,
        options,
        isYesOrNoAnswerable: run.isYesOrNoAnswerable,
      });
    } catch (error) {
      sendJson(request, response, 502, {
        error: error instanceof Error ? error.message : "Failed to submit the MAGI question.",
      });
    }
    return;
  }

  if (request.method === "GET" && pathname.startsWith("/api/council/runs/")) {
    const runId = pathname.split("/").pop();
    const run = runId ? runs.get(runId) : null;

    if (!run) {
      sendJson(request, response, 404, {
        error: "Run not found.",
      });
      return;
    }

    try {
      const snapshot = await buildRunSnapshot(run);
      sendJson(request, response, 200, snapshot);
    } catch (error) {
      sendJson(request, response, 500, {
        error: error instanceof Error ? error.message : "Failed to load the council run state.",
      });
    }
    return;
  }

  if (request.method === "GET" && pathname === "/api/council/history") {
    const limit = Number.parseInt(new URL(request.url ?? "/", "http://127.0.0.1").searchParams.get("limit") ?? "20", 10);
    const history = await readRunHistory(limit);
    sendJson(request, response, 200, { entries: history });
    return;
  }

  sendJson(request, response, 404, {
    error: "Not found.",
  });
}

const server = createServer(async (request, response) => {
  const parsedUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

  if (parsedUrl.pathname.startsWith("/api/")) {
    await handleApiRequest(request, response, parsedUrl.pathname);
    return;
  }

  await serveStatic(request, response, parsedUrl.pathname);
});

server.listen(BRIDGE_PORT, "0.0.0.0", () => {
  process.stdout.write(
    `MAGI UI bridge listening on http://0.0.0.0:${BRIDGE_PORT}\nGateway target: ${GATEWAY_URL}\nStatic root: ${STATIC_DIR}\n`,
  );
});

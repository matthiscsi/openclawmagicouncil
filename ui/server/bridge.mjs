import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";
import { appendHistoryEntry, readHistoryEntries } from "./lib/history-store.mjs";
import { loadRuntimePolicy } from "./lib/runtime-policy.mjs";

const MAGI_HOME = process.env.MAGI_HOME ?? path.join(os.homedir(), ".openclaw-magi");
const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(MAGI_HOME, "state");
const CONFIG_PATH = process.env.OPENCLAW_CONFIG_PATH ?? path.join(MAGI_HOME, "openclaw.json");
const GATEWAY_URL = process.env.MAGI_GATEWAY_URL ?? "ws://127.0.0.1:18790";
const POLICY = loadRuntimePolicy({
  magiHome: MAGI_HOME,
  cwd: process.cwd(),
});
const BRIDGE_PORT = Number.parseInt(process.env.MAGI_UI_BRIDGE_PORT ?? "18811", 10);
const GATEWAY_SUBMIT_TIMEOUT_MS = Number.parseInt(
  process.env.MAGI_GATEWAY_SUBMIT_TIMEOUT_MS ?? String(POLICY.timeouts.gatewaySubmitMs),
  10,
);
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

function readGatewayPasswordFromEnvFile() {
  const gatewayEnvPath = path.join(MAGI_HOME, "gateway.env");

  if (!existsSync(gatewayEnvPath)) {
    return "";
  }

  try {
    const raw = readFileSync(gatewayEnvPath, "utf8");

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex < 1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();

      if (key === "OPENCLAW_GATEWAY_PASSWORD" || key === "OPENCLAW_GATEWAY_TOKEN") {
        return value;
      }
    }
  } catch {
    return "";
  }

  return "";
}

const AUTOLOGIN_ENABLED = (process.env.MAGI_UI_AUTOLOGIN ?? "true").toLowerCase() !== "false";
const DEFAULT_GATEWAY_PASSWORD = (
  process.env.MAGI_UI_BRIDGE_PASSWORD
  ?? process.env.OPENCLAW_GATEWAY_PASSWORD
  ?? process.env.OPENCLAW_GATEWAY_TOKEN
  ?? readGatewayPasswordFromEnvFile()
  ?? ""
).trim();

if (!process.env.OPENCLAW_GATEWAY_PASSWORD && DEFAULT_GATEWAY_PASSWORD) {
  process.env.OPENCLAW_GATEWAY_PASSWORD = DEFAULT_GATEWAY_PASSWORD;
}

if (!process.env.OPENCLAW_GATEWAY_TOKEN && DEFAULT_GATEWAY_PASSWORD) {
  process.env.OPENCLAW_GATEWAY_TOKEN = DEFAULT_GATEWAY_PASSWORD;
}

const SESSION_COOKIE_NAME = "magi_bridge_sid";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const DEFAULT_MAGI_SESSION_KEY = "agent:magi:main";
const MEMBER_IDS = ["melchior", "balthasar", "casper"];
const DEFAULT_RUNTIME_OPTIONS = {
  councilMode: "auto",
  reasoningEffort: "auto",
  responseStyle: "balanced",
  executionPolicy: "allowlisted",
  highStakesMode: "normal",
};
const SPAWN_TIMEOUT_GRACE_MS = Number(POLICY.timeouts.spawnTimeoutGraceMs ?? 120000);
const FINALIZATION_NUDGE_GRACE_MS = Number(POLICY.timeouts.finalizationNudgeGraceMs ?? 30000);
const RUN_HARD_TIMEOUT_MS = Number(POLICY.timeouts.runHardTimeoutMs ?? 120000);
const RUN_INFO_TIMEOUT_MS = Number(POLICY.timeouts.runInfoTimeoutMs ?? 35000);
const RUN_STALL_NUDGE_MS = Number(POLICY.timeouts.runStallNudgeMs ?? 45000);
const RUN_INFO_STALL_NUDGE_MS = Number(POLICY.timeouts.runInfoStallNudgeMs ?? 15000);
const ASSISTANT_FIRST_ENABLED = (process.env.MAGI_ASSISTANT_FIRST ?? String(Boolean(POLICY.routing.assistantFirstEnabled))).toLowerCase() !== "false";
const HIGH_STAKES_KEYWORDS = Array.isArray(POLICY.lists.highStakesKeywords)
  ? POLICY.lists.highStakesKeywords
  : [];
const MONTH_LOOKUP = new Map([
  ["jan", 1],
  ["january", 1],
  ["feb", 2],
  ["february", 2],
  ["mar", 3],
  ["march", 3],
  ["apr", 4],
  ["april", 4],
  ["may", 5],
  ["jun", 6],
  ["june", 6],
  ["jul", 7],
  ["july", 7],
  ["aug", 8],
  ["august", 8],
  ["sep", 9],
  ["sept", 9],
  ["september", 9],
  ["oct", 10],
  ["october", 10],
  ["nov", 11],
  ["november", 11],
  ["dec", 12],
  ["december", 12],
]);
const WEATHER_CODE_LABELS = {
  0: "clear",
  1: "mostly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "rime fog",
  51: "light drizzle",
  53: "drizzle",
  55: "dense drizzle",
  56: "light freezing drizzle",
  57: "freezing drizzle",
  61: "light rain",
  63: "rain",
  65: "heavy rain",
  66: "light freezing rain",
  67: "freezing rain",
  71: "light snow",
  73: "snow",
  75: "heavy snow",
  77: "snow grains",
  80: "rain showers",
  81: "showers",
  82: "heavy showers",
  85: "snow showers",
  86: "heavy snow showers",
  95: "thunderstorm",
  96: "thunderstorm with hail",
  99: "severe thunderstorm with hail",
};
const UNIT_ALIASES = {
  m: "m",
  meter: "m",
  meters: "m",
  metre: "m",
  metres: "m",
  km: "km",
  kilometer: "km",
  kilometers: "km",
  kilometre: "km",
  kilometres: "km",
  cm: "cm",
  centimeter: "cm",
  centimeters: "cm",
  centimetre: "cm",
  centimetres: "cm",
  mm: "mm",
  millimeter: "mm",
  millimeters: "mm",
  millimetre: "mm",
  millimetres: "mm",
  mi: "mi",
  mile: "mi",
  miles: "mi",
  yd: "yd",
  yard: "yd",
  yards: "yd",
  ft: "ft",
  foot: "ft",
  feet: "ft",
  in: "in",
  inch: "in",
  inches: "in",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  g: "g",
  gram: "g",
  grams: "g",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  c: "c",
  "°c": "c",
  celsius: "c",
  f: "f",
  "°f": "f",
  fahrenheit: "f",
  k: "k",
  kelvin: "k",
  kmh: "kmh",
  "km/h": "kmh",
  mph: "mph",
  "mi/h": "mph",
  mps: "mps",
  "m/s": "mps",
};
const CURRENCY_CODES = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK",
  "PLN", "CZK", "HUF", "RON", "BGN", "TRY", "INR", "CNY", "HKD", "SGD", "AED",
  "ZAR", "BRL", "MXN", "KRW", "IDR", "PHP", "THB", "MYR",
]);
const INFO_META_PHRASES = Array.isArray(POLICY.lists.infoMetaPhrases)
  ? POLICY.lists.infoMetaPhrases
  : [];
const ALLOWED_DEV_ORIGINS = new Set([
  "http://127.0.0.1:18810",
  "http://localhost:18810",
  "http://192.168.129.169:18810",
  "http://100.100.237.73:18810",
  "https://homeserver.tailf7a295.ts.net:18810",
]);

const authSessions = new Map();
const runs = new Map();
let autoLoginPasswordValid = false;

let gatewayCallerPromise;

function json(value) {
  return JSON.stringify(value);
}

function now() {
  return Date.now();
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

async function callGateway(method, params, credential, extra = {}) {
  const gatewayCall = await getGatewayCaller();

  return gatewayCall({
    method,
    params,
    password: credential,
    token: credential,
    url: GATEWAY_URL,
    configPath: CONFIG_PATH,
    expectFinal: extra.expectFinal,
    timeoutMs: extra.timeoutMs,
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

async function establishAuthSession(response, password) {
  const sessionId = crypto.randomUUID();
  const session = {
    password,
    createdAt: now(),
  };
  authSessions.set(sessionId, session);
  setAuthCookie(response, sessionId);
  return session;
}

async function ensureBridgeAuthSession(request, response) {
  const existing = getAuthSession(request);

  if (existing) {
    return existing;
  }

  if (!AUTOLOGIN_ENABLED || !DEFAULT_GATEWAY_PASSWORD) {
    return null;
  }

  if (!autoLoginPasswordValid) {
    const ok = await verifyGatewayPassword(DEFAULT_GATEWAY_PASSWORD);

    if (!ok) {
      return null;
    }

    autoLoginPasswordValid = true;
  }

  return establishAuthSession(response, DEFAULT_GATEWAY_PASSWORD);
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
  await appendHistoryEntry({
    filePath: RUN_HISTORY_PATH,
    entry,
    schemaVersion: Number(POLICY.history.schemaVersion ?? 2),
    maxEntries: Number(POLICY.history.maxEntries ?? 300),
    maxBytes: Number(POLICY.history.maxBytes ?? 1_500_000),
  });
}

async function readRunHistory(limit = 20) {
  return readHistoryEntries(RUN_HISTORY_PATH, limit);
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

  if (isPersonalQuery(question) || isDeterministicInformationalQuestion(question)) {
    return false;
  }

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
  );
}

function isDeterministicInformationalQuestion(question) {
  const lower = typeof question === "string" ? question.toLowerCase() : "";
  return (
    isWeatherQuestion(question)
    || isMathQuestion(question)
    || isUnitConversionQuestion(question)
    || isCurrencyConversionQuestion(question)
    || isCurrentDateTimeQuestion(question)
    || isTimeQuery(question)
    || isDefinitionQuestion(question)
    || isUrlSummaryQuestion(question)
    || /\b(convert|conversion|timezone|time in|date in|exchange rate|translate)\b/.test(lower)
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

function shouldUseQuickCouncilForQuestion(question) {
  const lower = question.trim().toLowerCase();
  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  if (isPersonalQuery(question)) {
    return true;
  }

  const deterministicInformational = (
    !classifyQuestion(question)
    && isDeterministicInformationalQuestion(question)
  );

  if (deterministicInformational) {
    return true;
  }

  return (
    !classifyQuestion(question)
    && wordCount <= 18
    && !isHighStakesQuestion(question)
    && !/\b(legal|medical|financial|security|architecture|strategy)\b/.test(lower)
  );
}

function optimizeRuntimeOptions(question, options) {
  const tuned = { ...options };
  const tuningNotes = [];

  if (
    tuned.councilMode === "auto"
    && tuned.reasoningEffort === "auto"
    && shouldUseQuickCouncilForQuestion(question)
  ) {
    tuned.councilMode = "quick";
    tuned.reasoningEffort = "low";
    tuningNotes.push("auto-quick-mode");
  }

  if (
    tuned.responseStyle === "balanced"
    && question.trim().length > 420
    && tuned.councilMode !== "quick"
  ) {
    tuned.responseStyle = "detailed";
    tuningNotes.push("auto-detailed-response");
  }

  return {
    options: tuned,
    tuningNotes,
  };
}

function getRunTimeoutMs(run) {
  if (!run?.isYesOrNoAnswerable) {
    const question = typeof run?.question === "string" ? run.question : "";
    if (isDeterministicInformationalQuestion(question) || isPersonalQuery(question)) {
      return RUN_INFO_TIMEOUT_MS;
    }
  }

  return RUN_HARD_TIMEOUT_MS;
}

function getRunStallNudgeMs(run) {
  if (!run?.isYesOrNoAnswerable) {
    const question = typeof run?.question === "string" ? run.question : "";
    if (isDeterministicInformationalQuestion(question) || isPersonalQuery(question)) {
      return RUN_INFO_STALL_NUDGE_MS;
    }
  }

  return RUN_STALL_NUDGE_MS;
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
    "- If execution_policy is allowlisted and MAGI Council mode is enabled, execute approved execution_plan steps in the same run and report concrete outcomes.",
    "- Do not auto-escalate all execution-oriented requests to critical. Use standard mode for reversible, MAGI-scoped tasks unless risk is clearly high.",
    "- If high_stakes_mode is strict and the question is safety/legal/medical/financial, force council mode to critical and avoid shallow conclusions.",
    "- This UI bridge run must execute the three-seat council loop; do not bypass seat spawning with a direct single-seat reply.",
    "- For informational queries, return a concrete user-facing answer in decision/informational_answer; do not return only process commentary about how to answer.",
    "- Support general-assistant behavior across personal, practical, factual, and casual prompts; do not force binary framing when the user did not ask a binary question.",
    "- If a feasible bounded task is requested, do the task and report result; do not stop at meta-analysis.",
    "- Use plain language by default; reserve MAGI jargon for ops/diagnostics contexts.",
    "- Treat this envelope as operator control data, not part of the user's question.",
  ];

  return lines.join("\n");
}

function resolveRouteDecision(options) {
  if (!ASSISTANT_FIRST_ENABLED) {
    return {
      route: "council",
      reason: "assistant_first_disabled",
    };
  }

  if (!options || typeof options !== "object") {
    return {
      route: "assistant-first",
      reason: "assistant_first_default",
    };
  }

  if (options.highStakesMode === "strict") {
    return {
      route: "council",
      reason: "high_stakes_strict",
    };
  }

  return {
    route: "assistant-first",
    reason: "assistant_first_default",
  };
}

function getOutcomeCode({
  route = "council",
  councilExecuted = false,
  resolved = false,
  timedOutFallback = false,
  fallbackResolved = false,
  spawnMissing = false,
}) {
  if (!resolved) {
    return "processing";
  }

  if (spawnMissing) {
    return "spawn_missing";
  }

  if (timedOutFallback) {
    return "timeout_partial";
  }

  if (fallbackResolved) {
    return "fallback_resolved";
  }

  if (route === "assistant-first") {
    return "assistant_first_ok";
  }

  if (councilExecuted) {
    return "council_ok";
  }

  return "resolved";
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

function collectFinalPhaseTextBlocks(content) {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter((item) => {
      if (item?.type !== "text" || typeof item.text !== "string" || typeof item.textSignature !== "string") {
        return false;
      }

      try {
        const parsed = JSON.parse(item.textSignature);
        return normalizeLabel(parsed?.phase) === "final_answer";
      } catch {
        return false;
      }
    })
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

function asCleanString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringList(value) {
  if (typeof value === "string") {
    const single = asCleanString(value);
    return single ? [single] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => asCleanString(entry))
    .filter(Boolean);
}

function firstNonEmptyValue(values) {
  for (const value of values) {
    if (value) {
      return value;
    }
  }

  return null;
}

function formatMemberResponse(result) {
  const lines = [];

  if (typeof result?.stance === "string" && result.stance.trim()) {
    lines.push(`STANCE: ${result.stance.trim().toUpperCase()}`);
  }

  if (typeof result?.confidence === "number") {
    lines.push(`CONFIDENCE: ${result.confidence.toFixed(2)}`);
  }

  const answer = firstNonEmptyValue([
    asCleanString(result?.answer),
    asCleanString(result?.decision),
    asCleanString(result?.verdict),
    asCleanString(result?.summary),
    asCleanString(result?.conclusion),
  ]);

  if (answer) {
    lines.push(`ANSWER: ${answer}`);
  }

  const reasoningLines = [
    ...asStringList(result?.reasoning),
    ...asStringList(result?.rationale),
    ...asStringList(result?.analysis),
    ...asStringList(result?.reasoning_summary),
  ];

  if (reasoningLines.length > 0) {
    lines.push("REASONING:");
    for (const entry of Array.from(new Set(reasoningLines)).slice(0, 6)) {
      lines.push(`- ${entry}`);
    }
  }

  if (Array.isArray(result?.key_points) && result.key_points.length > 0) {
    lines.push("KEY POINTS:");
    for (const point of asStringList(result.key_points)) {
      lines.push(`- ${point}`);
    }
  }

  if (Array.isArray(result?.risks) && result.risks.length > 0) {
    lines.push("RISKS:");
    for (const risk of asStringList(result.risks)) {
      lines.push(`- ${risk}`);
    }
  }

  if (lines.length === 0 && typeof result === "object" && result !== null) {
    const rawSummary = asCleanString(
      JSON.stringify(result, null, 2).slice(0, 1200),
    );
    return rawSummary ?? "No structured seat response was returned.";
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
    "informational_answer",
    "dissent_summary",
    "degraded_mode",
    "execution_allowed",
    "execution_plan",
    "reasoning_summary",
  ]);
  const informationalAnswer = captureVerdictSection(fullText, "informational_answer", [
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
  const reasoningSummary = captureVerdictSection(fullText, "reasoning_summary", []);

  return {
    decisionText: informationalAnswer || decisionText || fullText.trim(),
    informationalAnswer,
    dissentSummary,
    reasoningSummary,
    fullText: fullText.trim(),
  };
}

function hasFinalAnswerPhase(content) {
  if (!Array.isArray(content)) {
    return false;
  }

  for (const item of content) {
    if (item?.type !== "text" || typeof item.textSignature !== "string") {
      continue;
    }

    try {
      const parsed = JSON.parse(item.textSignature);
      if (normalizeLabel(parsed?.phase) === "final_answer") {
        return true;
      }
    } catch {
      // Ignore malformed text signatures.
    }
  }

  return false;
}

function isFinalAssistantText(text, hasFinalPhase = false) {
  const trimmed = text.trim();
  void hasFinalPhase;

  if (!trimmed || trimmed === "NO_REPLY") {
    return false;
  }

  if (trimmed.includes("MAGI update:")) {
    return false;
  }

  if (
    /sync in progress/i.test(trimmed)
    || /synchronization phase/i.test(trimmed)
    || /waiting for melchior/i.test(trimmed)
    || trimmed.startsWith("[[reply_to_current]]")
  ) {
    return false;
  }

  if (
    trimmed.includes("decision:")
    || trimmed.includes("informational_answer:")
    || trimmed.includes("MAGI verdict")
    || trimmed.includes("MAGI COUNCIL SUMMARY")
  ) {
    return true;
  }

  return false;
}

function extractEmergencyAnswerText(rawText) {
  const trimmed = typeof rawText === "string" ? rawText.trim() : "";

  if (!trimmed || trimmed === "NO_REPLY") {
    return "";
  }

  if (trimmed.includes("decision:") || trimmed.includes("informational_answer:")) {
    const parsed = parseFinalVerdict(trimmed);
    const candidate = parsed.informationalAnswer || parsed.decisionText || "";
    return candidate.trim();
  }

  const emergencyMatch = trimmed.match(/emergency_answer:\s*([\s\S]+)/i);
  if (emergencyMatch?.[1]) {
    return emergencyMatch[1].trim();
  }

  return trimmed;
}

function isEmergencyProgressAnswer(text) {
  if (typeof text !== "string") {
    return true;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }

  return (
    /^(i('| a)m|we('| a)re)\s+(reviewing|checking|analy[sz]ing|looking|inspecting|working)\b/i.test(trimmed)
    || /^(starting|working on|let me|give me)\b/i.test(trimmed)
    || /\b(progress update|in progress)\b/i.test(trimmed)
  );
}

async function requestEmergencyDirectAnswer(run, reason = "timeout", options = {}) {
  const {
    forceRetry = false,
    maxWaitMs,
    extraInstructions = [],
  } = options ?? {};

  if (run?.emergencyDirectAnswer) {
    return run.emergencyDirectAnswer;
  }

  if (run?.emergencyDirectAttempted && !forceRetry) {
    return null;
  }

  run.emergencyDirectAttempted = true;
  const credential = typeof run?.credential === "string" ? run.credential : "";
  const sessionKey = run.emergencySessionKey ?? `agent:magi:emergency:${run.id}`;
  run.emergencySessionKey = sessionKey;
  const baseline = await getBaselineSnapshot(sessionKey);
  const normalizedExtraInstructions = Array.isArray(extraInstructions)
    ? extraInstructions
      .filter((instruction) => typeof instruction === "string")
      .map((instruction) => instruction.trim())
      .filter(Boolean)
    : [];

  try {
    await callGateway(
      "chat.send",
      {
        sessionKey,
        message: [
          `Emergency fallback mode: ${reason}.`,
          "Bridge override: this is a direct-answer fallback run, not a normal council run.",
          "Do not spawn MELCHIOR/BALTHASAR/CASPER for this message.",
          "Answer the user question directly with a concrete user-facing answer.",
          "If the question is personal, use a supportive and practical tone.",
          "If the question is factual, answer directly and include uncertainty only when necessary.",
          "Do not return generic productivity templates unless the user explicitly asked for planning/productivity help.",
          "Do not send progress updates. Respond only when the answer is complete and user-ready.",
          "Start with: emergency_answer:",
          ...normalizedExtraInstructions,
          `Question: ${run.question}`,
        ].join("\n"),
        deliver: false,
        idempotencyKey: crypto.randomUUID(),
      },
      credential,
      {
        expectFinal: false,
        timeoutMs: GATEWAY_SUBMIT_TIMEOUT_MS,
      },
    );
  } catch {
    return null;
  }

  const timeoutWindow = Number.isFinite(Number(maxWaitMs))
    ? Math.max(8000, Number(maxWaitMs))
    : Number(POLICY.routing.directTimeoutMs ?? 20000);
  const deadline = now() + timeoutWindow;
  let lastCandidate = "";
  while (now() < deadline) {
    await wait(1200);
    const currentSession = await getMagiSessionRecord(sessionKey);

    if (!currentSession || !existsSync(currentSession.filePath)) {
      continue;
    }

    const events = await readJsonLines(currentSession.filePath);
    const relevantEvents = baseline.sessionId === currentSession.sessionId
      ? events.slice(baseline.lineCount)
      : events;
    const text = findLastAssistantText(relevantEvents);
    const extracted = extractEmergencyAnswerText(text);

    if (extracted) {
      lastCandidate = extracted;
    }

    if (extracted && !isEmergencyProgressAnswer(extracted) && !isMetaInformationalAnswer(extracted)) {
      run.emergencyDirectAnswer = extracted;
      return extracted;
    }
  }

  if (lastCandidate && !isEmergencyProgressAnswer(lastCandidate) && !isMetaInformationalAnswer(lastCandidate)) {
    run.emergencyDirectAnswer = lastCandidate;
    return lastCandidate;
  }

  run.emergencyDirectAttempted = false;
  return null;
}

async function buildAssistantFirstAnswer(run) {
  const deterministic = await buildDeterministicInformationalAnswer(run.question);
  if (deterministic?.summary) {
    return {
      summary: deterministic.summary,
      details: deterministic.details ?? "",
      source: deterministic.source ?? "deterministic-assistant",
    };
  }

  if (run.isYesOrNoAnswerable) {
    const yesNoHeuristic = heuristicYesNoFallback(run.question);
    if (yesNoHeuristic) {
      return {
        summary: yesNoHeuristic,
        details: "Assistant-first heuristic answer was used (council escalation is currently off).",
        source: "assistant-heuristic",
      };
    }
  }

  if (isPersonalQuery(run.question)) {
    const personal = buildPersonalInformationalAnswer(run.question);
    return {
      summary: personal.summary,
      details: personal.details ?? "",
      source: personal.source ?? "personal-assistant",
    };
  }

  const repoWorkQuery = isRepoWorkQuery(run.question);
  const direct = await requestEmergencyDirectAnswer(
    run,
    "assistant-first direct route",
    {
      maxWaitMs: repoWorkQuery
        ? Number(POLICY.routing.repoReviewDirectTimeoutMs ?? 90000)
        : Number(POLICY.routing.directTimeoutMs ?? 20000),
      extraInstructions: repoWorkQuery
        ? [
          "This is a local codebase task. Execute the request now instead of asking for more detail.",
          "If the prompt references the MAGI repo on Desktop, assume path: /mnt/c/Users/server/Desktop/openclaw magi.",
          "Return concrete findings and prioritized improvements, not process commentary.",
          "Answer format: 1) highest-impact findings, 2) specific improvements, 3) optional next patch steps.",
        ]
        : [],
    },
  );
  if (typeof direct === "string" && direct.trim() && !isMetaInformationalAnswer(direct)) {
    const cleaned = direct.trim();
    return {
      summary: cleaned,
      details: "",
      source: "assistant-direct",
    };
  }

  if (repoWorkQuery) {
    const directRetry = await requestEmergencyDirectAnswer(
      run,
      "assistant-first repo work retry",
      {
        forceRetry: true,
        maxWaitMs: Number(POLICY.routing.retryTimeoutMs ?? 90000),
        extraInstructions: [
          "Retry in strict concrete mode.",
          "Do not ask clarifying questions unless absolutely blocking.",
          "Provide actionable output now: findings first, then patch plan.",
        ],
      },
    );

    if (typeof directRetry === "string" && directRetry.trim() && !isMetaInformationalAnswer(directRetry)) {
      const cleanedRetry = directRetry.trim();
      return {
        summary: cleanedRetry,
        details: "",
        source: "assistant-direct-retry",
      };
    }
  }

  return {
    summary: repoWorkQuery
      ? "Assistant-first attempted a direct repo review but did not finish in time."
      : "I can help with that directly, but this run did not return a concrete answer in time.",
    details: repoWorkQuery
      ? "Direct execution retry was attempted for the MAGI repository task. Re-run the same prompt once and I will continue with concrete findings."
      : "Assistant-first mode stayed active because MAGI Council is off.",
    source: "assistant-generic",
  };
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

function extractActionReturnValue(conditions) {
  if (typeof conditions !== "string") {
    return null;
  }

  const match = conditions.match(/ACTION:\s*RETURN\s+(.+?)(?:\s*\|\s*BLOCK:|$)/i);
  if (!match) {
    return null;
  }

  const value = match[1].trim().replace(/\.$/, "");
  return value || null;
}

function extractActionRecommendation(conditions) {
  if (typeof conditions !== "string") {
    return null;
  }

  const match = conditions.match(/ACTION:\s*(.+?)(?:\s*\|\s*BLOCK:|$)/i);
  if (!match) {
    return null;
  }

  const value = match[1].trim().replace(/\.$/, "");
  return value || null;
}

function extractUserFacingAnswerFromConditions(conditions) {
  if (typeof conditions !== "string") {
    return null;
  }

  const match = conditions.match(/USER-FACING ANSWER:\s*([\s\S]+)/i);
  if (!match?.[1]) {
    return null;
  }

  const cleaned = match[1]
    .replace(/\s+\|\s*BLOCK:.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return null;
  }

  return cleaned.endsWith(".") ? cleaned : `${cleaned}.`;
}

function parseResponseSections(response) {
  if (typeof response !== "string" || !response.trim()) {
    return {};
  }

  const lines = response.split(/\r?\n/);
  const sections = {};
  let activeSection = "root";

  const ensureSection = (name) => {
    if (!sections[name]) {
      sections[name] = [];
    }
  };

  ensureSection(activeSection);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const headingMatch = line.match(/^([A-Z _-]+):\s*(.*)$/i);
    if (headingMatch) {
      activeSection = normalizeLabel(headingMatch[1]).replace(/\s+/g, "_");
      ensureSection(activeSection);

      const remainder = headingMatch[2].trim();
      if (remainder) {
        sections[activeSection].push(remainder);
      }
      continue;
    }

    const value = line.startsWith("- ") ? line.slice(2).trim() : line;
    if (!value) {
      continue;
    }

    ensureSection(activeSection);
    sections[activeSection].push(value);
  }

  return sections;
}

function uniqueTrimmed(values) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function extractSeatAnswerFromResponse(response) {
  const sections = parseResponseSections(response);
  const candidates = [
    ...(sections.answer ?? []),
    ...(sections.decision ?? []),
    ...(sections.conclusion ?? []),
    ...(sections.verdict ?? []),
    ...(sections.summary ?? []),
    ...(sections.reasoning ?? []),
    ...(sections.key_points ?? []),
    ...(sections.root ?? []),
  ];

  const first = uniqueTrimmed(candidates)[0];
  return first ?? null;
}

function extractKeyPointsFromResponse(response) {
  const sections = parseResponseSections(response);
  const keyPoints = uniqueTrimmed([
    ...(sections.key_points ?? []),
    ...(sections.keypoints ?? []),
  ]);

  if (keyPoints.length > 0) {
    return keyPoints;
  }

  return uniqueTrimmed([
    ...(sections.reasoning ?? []),
    ...(sections.rationale ?? []),
    ...(sections.analysis ?? []),
  ]);
}

function extractRisksFromResponse(response) {
  const sections = parseResponseSections(response);
  return uniqueTrimmed([
    ...(sections.risks ?? []),
    ...(sections.risk ?? []),
  ]);
}

function readableSeatStatus(member) {
  if (!member) {
    return "unknown";
  }

  if (member.status === "yes") {
    return "yes";
  }

  if (member.status === "no") {
    return "no";
  }

  if (member.status === "conditional") {
    return "yes, with caveats";
  }

  if (member.status === "info") {
    return "informational analysis";
  }

  if (member.status === "error") {
    return "seat error";
  }

  return member.status;
}

function mostFrequent(values) {
  const counts = new Map();
  let bestValue = null;
  let bestCount = 0;

  for (const value of values) {
    const key = value.toLowerCase();
    const nextCount = (counts.get(key)?.count ?? 0) + 1;
    counts.set(key, {
      value,
      count: nextCount,
    });

    if (nextCount > bestCount) {
      bestValue = value;
      bestCount = nextCount;
    }
  }

  return bestValue;
}

function formatIsoDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysIso(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map((value) => Number.parseInt(value, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDate(date);
}

function buildIsoDate(year, month, day) {
  if (
    !Number.isInteger(year)
    || !Number.isInteger(month)
    || !Number.isInteger(day)
    || year < 1900
    || month < 1
    || month > 12
    || day < 1
    || day > 31
  ) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || (date.getUTCMonth() + 1) !== month
    || date.getUTCDate() !== day
  ) {
    return null;
  }

  return formatIsoDate(date);
}

function startOfIsoWeek(referenceDate = new Date()) {
  const utcDate = new Date(Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  ));
  const day = utcDate.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  utcDate.setUTCDate(utcDate.getUTCDate() + diffToMonday);
  return formatIsoDate(utcDate);
}

function parseWeekStartDate(question) {
  if (typeof question !== "string" || !question.trim()) {
    return null;
  }

  const lower = question.toLowerCase();
  const today = new Date();

  if (/\bnext week\b/.test(lower)) {
    return addDaysIso(startOfIsoWeek(today), 7);
  }

  if (/\bthis week\b/.test(lower) || /\bcurrent week\b/.test(lower)) {
    return startOfIsoWeek(today);
  }

  let match = lower.match(/week of\s+(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/i);
  if (match) {
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);

    return buildIsoDate(year, month, day);
  }

  match = lower.match(/week of\s+(\d{1,2})[\/\-\s]+([a-z]+|\d{1,2})[\/\-\s]+(\d{2,4})/i);
  if (!match) {
    match = lower.match(/(\d{1,2})[\/\-\s]+([a-z]+|\d{1,2})[\/\-\s]+(\d{2,4})/i);
    if (!match) {
      return null;
    }
  }

  const day = Number.parseInt(match[1], 10);
  const monthToken = match[2].toLowerCase();
  const yearToken = Number.parseInt(match[3], 10);
  const month = /^\d+$/.test(monthToken)
    ? Number.parseInt(monthToken, 10)
    : (MONTH_LOOKUP.get(monthToken) ?? null);
  const year = yearToken < 100 ? (2000 + yearToken) : yearToken;

  if (!month || Number.isNaN(day) || Number.isNaN(year)) {
    return null;
  }

  return buildIsoDate(year, month, day);
}

function extractWeatherLocations(question) {
  if (typeof question !== "string") {
    return [];
  }

  const cleaned = question
    .replace(/\?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const inMatch = cleaned.match(/\bin\s+(.+?)(?:\s+(?:for\s+)?(?:the\s+)?week\s+of\b|\s+(?:during|from|on)\b|$)/i);
  const forMatch = cleaned.match(/\bfor\s+(.+?)(?:\s+(?:for\s+)?(?:the\s+)?week\s+of\b|\s+(?:during|from|on)\b|$)/i);
  const rawSegment = (inMatch?.[1] ?? forMatch?.[1] ?? "").trim();

  if (!rawSegment) {
    return [];
  }

  const normalizedSegment = rawSegment
    .replace(/\bthe\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return Array.from(
    new Set(
      normalizedSegment
        .split(/,| and | & /i)
        .map((entry) => entry.replace(/\b(and|in)\b/gi, " ").replace(/\s+/g, " ").trim())
        .filter((entry) => entry.length >= 2),
    ),
  ).slice(0, 3);
}

function isWeatherQuestion(question) {
  const lower = typeof question === "string" ? question.toLowerCase() : "";
  return /\b(weather|forecast|temperature|rain|wind)\b/.test(lower);
}

function isMathQuestion(question) {
  if (typeof question !== "string") {
    return false;
  }

  const lower = question.toLowerCase();
  return (
    /\b(what is|calculate|solve|compute|evaluate)\b/.test(lower)
    && /[0-9]/.test(lower)
    && /[+\-*/^]/.test(lower)
  );
}

function isPersonalQuery(question) {
  if (typeof question !== "string") {
    return false;
  }

  const lower = question.toLowerCase();
  return (
    /\b(i feel|i am feeling|i'm feeling|i'm stressed|i am stressed|i'm anxious|i am anxious)\b/.test(lower)
    || /\bwhat should i do\b/.test(lower)
    || /\bplan my (day|week)\b/.test(lower)
    || /\bmy goal\b/.test(lower)
    || /\bpersonal\b/.test(lower)
    || /\b(gf|girlfriend|boyfriend|partner|wife|husband|relationship)\b/.test(lower)
  );
}

function isRepoWorkQuery(question) {
  if (typeof question !== "string") {
    return false;
  }

  const lower = question.toLowerCase();
  const intent = /\b(review|audit|inspect|check|analy[sz]e|improve|patch|refactor|fix|changes|additions)\b/.test(lower);
  const scope = /\b(repo|repository|codebase|project|desktop folder|source|files|magi system)\b/.test(lower);

  return intent && scope;
}

function isMetaInformationalAnswer(text) {
  if (typeof text !== "string") {
    return true;
  }

  const lower = text.toLowerCase();
  return INFO_META_PHRASES.some((phrase) => lower.includes(phrase));
}

function extractMathExpression(question) {
  if (typeof question !== "string") {
    return null;
  }

  const cleaned = question
    .replace(/\?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normalized = cleaned
    .replace(/\bplus\b/gi, "+")
    .replace(/\bminus\b/gi, "-")
    .replace(/\btimes\b/gi, "*")
    .replace(/\bmultiplied by\b/gi, "*")
    .replace(/\bdivided by\b/gi, "/")
    .replace(/\bto the power of\b/gi, "^")
    .replace(/\bpower of\b/gi, "^");
  const match = normalized.match(/(?:what is|calculate|solve|compute|evaluate)\s+(.+)$/i);
  const candidate = (match?.[1] ?? normalized).trim();

  if (!candidate) {
    return null;
  }

  const expression = candidate
    .replace(/[^0-9+\-*/^().,\s]/g, "")
    .replace(/,/g, ".")
    .replace(/\s+/g, "");

  if (!expression || expression.length > 80) {
    return null;
  }

  if (!/^[0-9+\-*/^().]+$/.test(expression)) {
    return null;
  }

  if (!/[0-9]/.test(expression) || !/[+\-*/^]/.test(expression)) {
    return null;
  }

  return expression;
}

function evaluateMathExpression(expression) {
  const jsExpression = expression.replace(/\^/g, "**");

  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${jsExpression});`)();

    if (!Number.isFinite(result)) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}

function buildMathInformationalAnswer(question) {
  if (!isMathQuestion(question)) {
    return null;
  }

  const expression = extractMathExpression(question);
  if (!expression) {
    return null;
  }

  const value = evaluateMathExpression(expression);
  if (value === null) {
    return null;
  }

  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(8).replace(/\.?0+$/, "");

  return {
    summary: `Result: ${expression} = ${rounded}.`,
    details: `Computed directly from the expression ${expression}.`,
    source: "deterministic-math",
  };
}

function normalizeUnitToken(token) {
  if (typeof token !== "string") {
    return null;
  }

  const normalized = token.toLowerCase().replace(/\s+/g, "");
  return UNIT_ALIASES[normalized] ?? null;
}

function getUnitFamily(unit) {
  if (["m", "km", "cm", "mm", "mi", "yd", "ft", "in"].includes(unit)) {
    return "length";
  }

  if (["kg", "g", "lb", "oz"].includes(unit)) {
    return "weight";
  }

  if (["c", "f", "k"].includes(unit)) {
    return "temperature";
  }

  if (["kmh", "mph", "mps"].includes(unit)) {
    return "speed";
  }

  return null;
}

function convertLinearUnit(value, fromUnit, toUnit, factors) {
  const fromFactor = factors[fromUnit];
  const toFactor = factors[toUnit];

  if (typeof fromFactor !== "number" || typeof toFactor !== "number") {
    return null;
  }

  const baseValue = value * fromFactor;
  return baseValue / toFactor;
}

function convertTemperature(value, fromUnit, toUnit) {
  let celsius = null;

  if (fromUnit === "c") {
    celsius = value;
  } else if (fromUnit === "f") {
    celsius = (value - 32) * (5 / 9);
  } else if (fromUnit === "k") {
    celsius = value - 273.15;
  }

  if (celsius === null) {
    return null;
  }

  if (toUnit === "c") {
    return celsius;
  }

  if (toUnit === "f") {
    return (celsius * 9 / 5) + 32;
  }

  if (toUnit === "k") {
    return celsius + 273.15;
  }

  return null;
}

function unitLabel(unit) {
  const labels = {
    m: "m",
    km: "km",
    cm: "cm",
    mm: "mm",
    mi: "mi",
    yd: "yd",
    ft: "ft",
    in: "in",
    kg: "kg",
    g: "g",
    lb: "lb",
    oz: "oz",
    c: "C",
    f: "F",
    k: "K",
    kmh: "km/h",
    mph: "mph",
    mps: "m/s",
  };

  return labels[unit] ?? unit;
}

function isUnitConversionQuestion(question) {
  if (typeof question !== "string") {
    return false;
  }

  const lower = question.toLowerCase();
  return (
    /\bconvert\b/.test(lower)
    && /-?\d+(\.\d+)?/.test(lower)
    && /\b(to|in)\b/.test(lower)
  ) || /-?\d+(\.\d+)?\s*[a-z°/]+\s+(?:to|in)\s+[a-z°/]+/i.test(lower);
}

function parseUnitConversion(question) {
  if (typeof question !== "string") {
    return null;
  }

  const cleaned = question
    .replace(/,/g, ".")
    .replace(/\s+/g, " ")
    .trim();
  const match = cleaned.match(/(-?\d+(?:\.\d+)?)\s*([a-z°/]+)\s+(?:to|in)\s+([a-z°/]+)/i);

  if (!match) {
    return null;
  }

  const value = Number.parseFloat(match[1]);
  const fromUnit = normalizeUnitToken(match[2]);
  const toUnit = normalizeUnitToken(match[3]);

  if (!Number.isFinite(value) || !fromUnit || !toUnit) {
    return null;
  }

  return { value, fromUnit, toUnit };
}

function buildUnitConversionInformationalAnswer(question) {
  if (!isUnitConversionQuestion(question)) {
    return null;
  }

  const parsed = parseUnitConversion(question);
  if (!parsed) {
    return null;
  }

  const fromFamily = getUnitFamily(parsed.fromUnit);
  const toFamily = getUnitFamily(parsed.toUnit);

  if (!fromFamily || !toFamily || fromFamily !== toFamily) {
    return {
      summary: "I can only convert between compatible unit families (for example length-to-length or temperature-to-temperature).",
      details: `Requested conversion from ${parsed.fromUnit} to ${parsed.toUnit} is not compatible.`,
      source: "deterministic-units",
    };
  }

  let result = null;

  if (fromFamily === "temperature") {
    result = convertTemperature(parsed.value, parsed.fromUnit, parsed.toUnit);
  } else if (fromFamily === "length") {
    result = convertLinearUnit(parsed.value, parsed.fromUnit, parsed.toUnit, {
      m: 1,
      km: 1000,
      cm: 0.01,
      mm: 0.001,
      mi: 1609.344,
      yd: 0.9144,
      ft: 0.3048,
      in: 0.0254,
    });
  } else if (fromFamily === "weight") {
    result = convertLinearUnit(parsed.value, parsed.fromUnit, parsed.toUnit, {
      kg: 1,
      g: 0.001,
      lb: 0.45359237,
      oz: 0.028349523125,
    });
  } else if (fromFamily === "speed") {
    result = convertLinearUnit(parsed.value, parsed.fromUnit, parsed.toUnit, {
      mps: 1,
      kmh: 0.2777777778,
      mph: 0.44704,
    });
  }

  if (!Number.isFinite(result)) {
    return null;
  }

  const rounded = Math.abs(result) >= 100
    ? result.toFixed(2)
    : result.toFixed(6).replace(/\.?0+$/, "");

  return {
    summary: `Conversion result: ${parsed.value} ${unitLabel(parsed.fromUnit)} = ${rounded} ${unitLabel(parsed.toUnit)}.`,
    details: `Converted within ${fromFamily} units.`,
    source: "deterministic-units",
  };
}

function isArtemisFuelCostQuestion(question) {
  if (typeof question !== "string") {
    return false;
  }

  const lower = question.toLowerCase();
  return (
    /\bartemis\s*(ii|2)\b/.test(lower)
    && /\b(fuel|propellant|burned|consumed)\b/.test(lower)
    && /\b(euro|eur|€|cost|price|worth)\b/.test(lower)
  );
}

function buildArtemisFuelCostInformationalAnswer(question) {
  if (!isArtemisFuelCostQuestion(question)) {
    return null;
  }

  const euroFormatter = new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

  // SLS Block 1 rough public-order assumptions (core + upper stage + boosters).
  const lh2Liters = 2_100_000;
  const loxLiters = 760_000;
  const boosterPropellantKg = 1_400_000;

  const lh2DensityKgPerLiter = 0.071;
  const loxDensityKgPerLiter = 1.141;

  const lh2Kg = lh2Liters * lh2DensityKgPerLiter;
  const loxKg = loxLiters * loxDensityKgPerLiter;

  const liquidLow = (lh2Kg * 4.0) + (loxKg * 0.10);
  const liquidHigh = (lh2Kg * 9.0) + (loxKg * 0.35);
  const totalLow = liquidLow + (boosterPropellantKg * 1.5);
  const totalHigh = liquidHigh + (boosterPropellantKg * 4.0);

  return {
    summary: [
      "There is no official single published euro figure for Artemis II fuel burn.",
      `A practical estimate is about ${euroFormatter.format(totalLow)} to ${euroFormatter.format(totalHigh)} in propellant value,`,
      `with liquid propellants alone roughly ${euroFormatter.format(liquidLow)} to ${euroFormatter.format(liquidHigh)}.`,
    ].join(" "),
    details: [
      "Estimate basis (order-of-magnitude):",
      `- Liquid H2 assumed: ~${Math.round(lh2Liters / 1000)}k L`,
      `- Liquid O2 assumed: ~${Math.round(loxLiters / 1000)}k L`,
      `- Solid booster propellant assumed: ~${Math.round(boosterPropellantKg / 1000)}k kg total`,
      "- Unit-price assumptions are broad industrial ranges; real procurement contracts can differ materially.",
      "- This is propellant value only, not total mission cost or launch vehicle program cost.",
    ].join("\n"),
    source: "space-estimate",
  };
}

function isCurrencyConversionQuestion(question) {
  if (typeof question !== "string") {
    return false;
  }

  const lower = question.toLowerCase();
  return (
    /\b(convert|exchange)\b/.test(lower)
    && /\b[a-z]{3}\b/.test(lower)
    && /\b(to|in)\b/.test(lower)
    && /-?\d+(\.\d+)?/.test(lower)
  );
}

function parseCurrencyConversion(question) {
  if (typeof question !== "string") {
    return null;
  }

  const cleaned = question.replace(/,/g, ".").replace(/\s+/g, " ").trim();
  const match = cleaned.match(/(-?\d+(?:\.\d+)?)\s*([a-z]{3})\s+(?:to|in)\s+([a-z]{3})/i);
  if (!match) {
    return null;
  }

  const amount = Number.parseFloat(match[1]);
  const from = match[2].toUpperCase();
  const to = match[3].toUpperCase();

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  if (!CURRENCY_CODES.has(from) || !CURRENCY_CODES.has(to)) {
    return null;
  }

  return { amount, from, to };
}

async function buildCurrencyConversionInformationalAnswer(question) {
  if (!isCurrencyConversionQuestion(question)) {
    return null;
  }

  const parsed = parseCurrencyConversion(question);
  if (!parsed) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      amount: String(parsed.amount),
      from: parsed.from,
      to: parsed.to,
    });
    const payload = await fetchJson(`https://api.frankfurter.app/latest?${params.toString()}`);
    const rate = payload?.rates?.[parsed.to];

    if (!Number.isFinite(rate)) {
      return null;
    }

    const rounded = Number(rate).toFixed(4).replace(/\.?0+$/, "");
    return {
      summary: `Currency conversion: ${parsed.amount} ${parsed.from} = ${rounded} ${parsed.to}.`,
      details: `Rate date: ${payload?.date ?? "latest available"}. Source: Frankfurter.app`,
      source: "currency-api",
    };
  } catch (error) {
    return {
      summary: `I could not fetch a live rate for ${parsed.from} to ${parsed.to} right now.`,
      details: error instanceof Error ? error.message : "Currency API request failed.",
      source: "currency-api",
    };
  }
}

function isTimeQuery(question) {
  if (typeof question !== "string") {
    return false;
  }

  return /\b(time in|what time is it in|local time in)\b/i.test(question);
}

function isCurrentDateTimeQuestion(question) {
  if (typeof question !== "string") {
    return false;
  }

  if (isTimeQuery(question)) {
    return false;
  }

  return /\b(what date is it|what day is it|today'?s date|current date|current time|what time is it)\b/i.test(question);
}

function buildCurrentDateTimeInformationalAnswer(question) {
  if (!isCurrentDateTimeQuestion(question)) {
    return null;
  }

  const nowDate = new Date();
  const includesTime = /\b(time|current time|what time is it)\b/i.test(question);
  const summaryFormatter = new Intl.DateTimeFormat("en-GB", includesTime
    ? {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }
    : {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "2-digit",
    });
  const summary = includesTime
    ? `Current local date/time: ${summaryFormatter.format(nowDate)}.`
    : `Today is ${summaryFormatter.format(nowDate)}.`;

  return {
    summary,
    details: "Local system time was used.",
    source: "local-datetime",
  };
}

function extractTimeLocation(question) {
  if (typeof question !== "string") {
    return null;
  }

  const cleaned = question.replace(/\?/g, " ").replace(/\s+/g, " ").trim();
  const match = cleaned.match(/(?:time in|what time is it in|local time in)\s+(.+)$/i);
  const raw = match?.[1]?.trim();
  if (!raw) {
    return null;
  }

  return raw.replace(/\bnow\b/gi, "").trim();
}

async function buildTimeInformationalAnswer(question) {
  if (!isTimeQuery(question)) {
    return null;
  }

  const location = extractTimeLocation(question);
  if (!location) {
    return null;
  }

  try {
    const geo = await geocodeLocation(location);
    if (!geo?.timezone) {
      return null;
    }

    const nowDate = new Date();
    const formatted = new Intl.DateTimeFormat("en-GB", {
      timeZone: geo.timezone,
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(nowDate);

    return {
      summary: `Current local time in ${geo.name}${geo.country ? `, ${geo.country}` : ""}: ${formatted}.`,
      details: `Timezone: ${geo.timezone}.`,
      source: "timezone-resolver",
    };
  } catch (error) {
    return {
      summary: `I could not resolve the local time for ${location} right now.`,
      details: error instanceof Error ? error.message : "Timezone lookup failed.",
      source: "timezone-resolver",
    };
  }
}

function isDefinitionQuestion(question) {
  if (typeof question !== "string") {
    return false;
  }

  const lower = question.toLowerCase().trim();
  return (
    lower.startsWith("what is ")
    || lower.startsWith("who is ")
    || lower.startsWith("define ")
  );
}

function extractDefinitionTopic(question) {
  if (typeof question !== "string") {
    return null;
  }

  const cleaned = question
    .replace(/\?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = cleaned.match(/^(?:what is|who is|define)\s+(.+)$/i);
  const topic = match?.[1]?.trim();

  if (!topic) {
    return null;
  }

  if (topic.split(/\s+/).length > 8) {
    return null;
  }

  return topic;
}

function buildTechGlossaryInformationalAnswer(question) {
  if (!isDefinitionQuestion(question)) {
    return null;
  }

  const topic = extractDefinitionTopic(question);
  if (!topic) {
    return null;
  }

  const key = topic.toLowerCase().trim();
  const glossary = {
    docker: "Docker is a platform for packaging and running applications in containers so they behave consistently across machines.",
    "wsl": "WSL (Windows Subsystem for Linux) lets you run Linux user-space tools directly on Windows without a full virtual machine.",
    "wsl2": "WSL2 runs a real Linux kernel in a lightweight VM on Windows, giving better compatibility and performance than WSL1.",
    tailscale: "Tailscale is a private mesh VPN built on WireGuard that securely connects your devices as if they were on one private network.",
    openclaw: "OpenClaw is an agent gateway/orchestration system for running model-driven agents, tools, and multi-agent workflows.",
    magi: "MAGI in this setup is your council-based conductor agent on OpenClaw, combining three seats (Melchior, Balthasar, Casper) into one final response.",
  };

  const summary = glossary[key];
  if (!summary) {
    return null;
  }

  return {
    summary,
    details: "Source: local MAGI glossary.",
    source: "local-glossary",
  };
}

async function buildDefinitionInformationalAnswer(question) {
  if (!isDefinitionQuestion(question)) {
    return null;
  }

  const topic = extractDefinitionTopic(question);
  if (!topic) {
    return null;
  }

  try {
    const encoded = encodeURIComponent(topic.replace(/\s+/g, "_"));
    const payload = await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`);
    if (payload?.type === "disambiguation") {
      return null;
    }
    const extract = typeof payload?.extract === "string" ? payload.extract.trim() : "";

    if (!extract) {
      return null;
    }

    if (/may refer to/i.test(extract)) {
      return null;
    }

    const short = extract.length > 420 ? `${extract.slice(0, 417).trim()}...` : extract;
    return {
      summary: short,
      details: `Source: Wikipedia summary for ${payload?.title ?? topic}.`,
      source: "wikipedia-summary",
    };
  } catch {
    return null;
  }
}

function extractFirstUrl(question) {
  if (typeof question !== "string") {
    return null;
  }

  const match = question.match(/https?:\/\/[^\s)]+/i);
  return match?.[0] ?? null;
}

function isUrlSummaryQuestion(question) {
  if (typeof question !== "string") {
    return false;
  }

  const hasUrl = Boolean(extractFirstUrl(question));
  const asksSummary = /\b(summarize|summary|what is this|read this|explain this link)\b/i.test(question);
  return hasUrl && asksSummary;
}

function stripHtmlToText(html) {
  if (typeof html !== "string") {
    return "";
  }

  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

async function buildUrlSummaryInformationalAnswer(question) {
  if (!isUrlSummaryQuestion(question)) {
    return null;
  }

  const url = extractFirstUrl(question);
  if (!url) {
    return null;
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "MAGI-UI-Bridge/0.1",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      return {
        summary: `I could not fetch the link (${response.status}) to summarize it.`,
        details: url,
        source: "url-summary",
      };
    }

    const html = (await response.text()).slice(0, 120000);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const descriptionMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i);
    const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "";
    const description = descriptionMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "";
    const plain = stripHtmlToText(html);
    const snippet = plain.slice(0, 520).trim();

    const summary = description
      || snippet
      || "The page is reachable but did not expose enough readable text for a useful summary.";

    return {
      summary: title ? `${title}: ${summary}` : summary,
      details: `Source URL: ${url}`,
      source: "url-summary",
    };
  } catch (error) {
    return {
      summary: "I could not fetch and summarize that link right now.",
      details: error instanceof Error ? error.message : "URL fetch failed.",
      source: "url-summary",
    };
  }
}

function heuristicYesNoFallback(question) {
  if (typeof question !== "string") {
    return null;
  }

  const lower = question.trim().toLowerCase();

  if (/\bis\s+.+\bunhealthy\b/.test(lower)) {
    return "Likely yes in general, though risk depends on dose, frequency, and individual context.";
  }

  if (/\bis\s+.+\bsafe\b/.test(lower)) {
    return "Not universally safe; safety depends on context, exposure level, and individual risk factors.";
  }

  if (lower.startsWith("should i ") || lower.startsWith("should we ")) {
    return "Proceed cautiously and avoid irreversible actions until a full council pass completes.";
  }

  return null;
}

function heuristicPersonalFallback(question) {
  if (!isPersonalQuery(question)) {
    return null;
  }

  return "Let us keep it practical: pick one small next step you can do in under 10 minutes, do that first, then reassess with me for the next step.";
}

function isGenericPersonalTemplate(text) {
  if (typeof text !== "string") {
    return false;
  }

  const lower = text.toLowerCase();
  return (
    lower.includes("pick one task")
    || lower.includes("small, concrete next-step plan")
    || lower.includes("work 20-30 minutes")
    || lower.includes("then choose the next smallest step")
  );
}

function looksActionablePersonalAnswer(text) {
  if (typeof text !== "string") {
    return false;
  }

  const lower = text.toLowerCase();
  return (
    /\b(step|first|next|then)\b/.test(lower)
    || /\b1\.\s+/.test(lower)
    || /\bmust-do\b/.test(lower)
    || /\b10\s*min/.test(lower)
  );
}

function buildPersonalInformationalAnswer(question) {
  const lower = typeof question === "string" ? question.toLowerCase() : "";

  if (
    /\b(gf|girlfriend|boyfriend|partner|wife|husband)\b/.test(lower)
    || /\brelationship\b/.test(lower)
    || /\bmake .* happy\b/.test(lower)
  ) {
    return {
      summary: "Focus on connection over control: ask what would help her feel supported this week, listen without defensiveness, and follow through on one specific thing she asks for.",
      details: [
        "Practical approach:",
        "- Start with a direct check-in: \"What would make this week feel better for you?\"",
        "- Listen fully first, then reflect back what you heard before proposing solutions.",
        "- Do one concrete action she values (time, help, affection, reliability) within 24 hours.",
        "- Keep consistency: small repeated care beats one big gesture.",
      ].join("\n"),
      source: "personal-plan",
    };
  }

  if (/\boverwhelmed\b/.test(lower) || /\bplan tonight\b/.test(lower)) {
    return {
      summary: "Tonight plan: 1) 10-minute reset, 2) one must-do task for 25 minutes, 3) one easy admin task for 15 minutes, then stop.",
      details: [
        "Suggested flow:",
        "- 10 min: reset your space, water, and quick brain-dump list.",
        "- 25 min: do the single highest-impact task only.",
        "- 15 min: finish one low-friction task (reply, tidy, or schedule).",
        "- 5 min: write tomorrow's first task and shut down.",
      ].join("\n"),
      source: "personal-plan",
    };
  }

  return {
    summary: "Use a small, concrete next-step plan: choose one priority, set a short timer, and finish only that before deciding the next action.",
    details: [
      "Simple loop:",
      "- Pick one task.",
      "- Work 20-30 minutes with no multitasking.",
      "- Stop, review progress, then choose the next smallest step.",
    ].join("\n"),
    source: "personal-plan",
  };
}

function weatherCodeLabel(code) {
  if (typeof code !== "number") {
    return "conditions unavailable";
  }

  return WEATHER_CODE_LABELS[code] ?? "mixed conditions";
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "MAGI-UI-Bridge/0.1",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  return response.json();
}

async function geocodeLocation(location) {
  const params = new URLSearchParams({
    name: location,
    count: "1",
    language: "en",
    format: "json",
  });

  const payload = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`);
  const first = Array.isArray(payload?.results) ? payload.results[0] : null;

  if (!first || typeof first.latitude !== "number" || typeof first.longitude !== "number") {
    return null;
  }

  return {
    query: location,
    name: first.name ?? location,
    latitude: first.latitude,
    longitude: first.longitude,
    timezone: first.timezone ?? "auto",
    country: first.country ?? null,
  };
}

async function fetchWeeklyWeatherForLocation(geo, startDate, endDate) {
  const params = new URLSearchParams({
    latitude: String(geo.latitude),
    longitude: String(geo.longitude),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max",
    timezone: geo.timezone ?? "auto",
    start_date: startDate,
    end_date: endDate,
  });

  const payload = await fetchJson(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  const daily = payload?.daily;

  if (!daily || !Array.isArray(daily.time) || daily.time.length === 0) {
    return null;
  }

  const days = daily.time.map((date, index) => ({
    date,
    weatherCode: Number.isFinite(daily.weather_code?.[index]) ? daily.weather_code[index] : null,
    maxTemp: Number.isFinite(daily.temperature_2m_max?.[index]) ? daily.temperature_2m_max[index] : null,
    minTemp: Number.isFinite(daily.temperature_2m_min?.[index]) ? daily.temperature_2m_min[index] : null,
    precip: Number.isFinite(daily.precipitation_probability_max?.[index])
      ? daily.precipitation_probability_max[index]
      : null,
    wind: Number.isFinite(daily.wind_speed_10m_max?.[index]) ? daily.wind_speed_10m_max[index] : null,
  }));

  return {
    location: `${geo.name}${geo.country ? `, ${geo.country}` : ""}`,
    days,
  };
}

function averageNumbers(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length === 0) {
    return null;
  }

  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function mostFrequentNumber(values) {
  const counts = new Map();
  let winner = null;
  let bestCount = 0;

  for (const value of values) {
    if (!Number.isFinite(value)) {
      continue;
    }

    const key = Math.round(value);
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    if (next > bestCount) {
      bestCount = next;
      winner = key;
    }
  }

  return winner;
}

function alignIsoDateToYear(isoDate, year) {
  const [_, monthToken, dayToken] = isoDate.split("-");
  const month = Number.parseInt(monthToken, 10);
  const day = Number.parseInt(dayToken, 10);

  if (!Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const safeDay = Math.min(day, maxDay);
  return buildIsoDate(year, month, safeDay);
}

async function fetchHistoricalClimateForLocation(geo, weekStart, yearsBack = 6) {
  const currentYear = new Date().getUTCFullYear();
  const samples = [];

  for (let index = 1; index <= yearsBack; index += 1) {
    const year = currentYear - index;
    const startDate = alignIsoDateToYear(weekStart, year);

    if (!startDate) {
      continue;
    }

    const endDate = addDaysIso(startDate, 6);
    const params = new URLSearchParams({
      latitude: String(geo.latitude),
      longitude: String(geo.longitude),
      start_date: startDate,
      end_date: endDate,
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
      timezone: geo.timezone ?? "UTC",
    });

    try {
      const payload = await fetchJson(`https://archive-api.open-meteo.com/v1/archive?${params.toString()}`);
      const daily = payload?.daily;
      const maxTempValues = Array.isArray(daily?.temperature_2m_max) ? daily.temperature_2m_max : [];
      const minTempValues = Array.isArray(daily?.temperature_2m_min) ? daily.temperature_2m_min : [];
      const precipValues = Array.isArray(daily?.precipitation_sum) ? daily.precipitation_sum : [];
      const weatherCodes = Array.isArray(daily?.weather_code) ? daily.weather_code : [];

      const avgMax = averageNumbers(maxTempValues);
      const avgMin = averageNumbers(minTempValues);
      const totalPrecip = averageNumbers(precipValues);

      if (avgMax === null && avgMin === null && totalPrecip === null) {
        continue;
      }

      samples.push({
        year,
        avgMax,
        avgMin,
        totalPrecip,
        weatherCode: mostFrequentNumber(weatherCodes),
      });
    } catch {
      // Partial failures are acceptable; continue with remaining sample years.
    }
  }

  if (samples.length === 0) {
    return null;
  }

  return {
    location: `${geo.name}${geo.country ? `, ${geo.country}` : ""}`,
    avgMax: averageNumbers(samples.map((sample) => sample.avgMax)),
    avgMin: averageNumbers(samples.map((sample) => sample.avgMin)),
    avgPrecipMm: averageNumbers(samples.map((sample) => sample.totalPrecip)),
    dominantCode: mostFrequentNumber(samples.map((sample) => sample.weatherCode)),
    sampleYears: samples.map((sample) => sample.year).sort((left, right) => left - right),
  };
}

function formatDailyForecastLine(day) {
  const dateLabel = new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
  const tempPart = (day.minTemp !== null && day.maxTemp !== null)
    ? `${Math.round(day.minTemp)}-${Math.round(day.maxTemp)}C`
    : "temp n/a";
  const precipPart = day.precip !== null ? `rain ${Math.round(day.precip)}%` : "rain n/a";
  const windPart = day.wind !== null ? `wind ${Math.round(day.wind)} km/h` : "wind n/a";
  const conditionPart = weatherCodeLabel(day.weatherCode);

  return `${dateLabel}: ${conditionPart}, ${tempPart}, ${precipPart}, ${windPart}`;
}

async function buildWeatherInformationalAnswer(question) {
  if (!isWeatherQuestion(question)) {
    return null;
  }

  const locations = extractWeatherLocations(question);
  let weekStart = parseWeekStartDate(question);

  if (!weekStart) {
    weekStart = formatIsoDate(new Date());
  }

  if (locations.length === 0) {
    const weekEndHint = addDaysIso(weekStart, 6);
    return {
      summary: `I can fetch this week’s weather, but I need a location (city or region).`,
      details: [
        `Interpreted week window: ${weekStart} to ${weekEndHint}.`,
        "Try: \"weather in Antwerp this week\" or \"weather in Ghent and Antwerp week of 13-04-2026\".",
      ].join("\n"),
      source: "weather-input",
    };
  }

  const weekEnd = addDaysIso(weekStart, 6);
  const forecasts = [];
  const failures = [];
  const geocodedLocations = [];

  for (const location of locations) {
    try {
      const geo = await geocodeLocation(location);
      if (!geo) {
        failures.push(`${location}: could not resolve location.`);
        continue;
      }
      geocodedLocations.push(geo);

      const forecast = await fetchWeeklyWeatherForLocation(geo, weekStart, weekEnd);
      if (!forecast) {
        failures.push(`${location}: no forecast returned.`);
        continue;
      }

      forecasts.push(forecast);
    } catch (error) {
      failures.push(`${location}: ${error instanceof Error ? error.message : "lookup failed"}`);
    }
  }

  if (forecasts.length === 0) {
    const climateLookups = [];
    for (const geo of geocodedLocations) {
      const climate = await fetchHistoricalClimateForLocation(geo, weekStart);
      if (climate) {
        climateLookups.push(climate);
      }
    }

    if (climateLookups.length > 0) {
      const summaryParts = climateLookups.map((climate) => {
        const min = Number.isFinite(climate.avgMin) ? Math.round(climate.avgMin) : null;
        const max = Number.isFinite(climate.avgMax) ? Math.round(climate.avgMax) : null;
        const precip = Number.isFinite(climate.avgPrecipMm) ? climate.avgPrecipMm.toFixed(1) : null;
        const condition = weatherCodeLabel(climate.dominantCode);
        const tempRange = (min !== null && max !== null) ? `${min}-${max}C` : "temp n/a";
        return `${climate.location}: typical ${tempRange}, typical precip ${precip !== null ? `${precip} mm/day` : "n/a"}, common conditions ${condition}`;
      });

      const details = climateLookups.map((climate) => {
        const years = climate.sampleYears.length > 0
          ? `${climate.sampleYears[0]}-${climate.sampleYears[climate.sampleYears.length - 1]}`
          : "historical sample";
        return `${climate.location}\n- Seasonal expectation window based on archive years: ${years}\n- Interpreting note: this is climatology, not a daily forecast.`;
      }).join("\n\n");

      const fallbackNote = failures.length > 0
        ? `\n\nForecast API limits/failures: ${failures.join(" ")}`
        : "";

      return {
        summary: `No reliable day-by-day forecast is available for ${weekStart} to ${weekEnd}. Seasonal outlook: ${summaryParts.join(" | ")}.`,
        details: `${details}${fallbackNote}`,
        source: "Open-Meteo archive",
      };
    }

    return {
      summary: `No reliable weather forecast could be retrieved for ${locations.join(" and ")} (${weekStart} to ${weekEnd}).`,
      details: failures.length > 0
        ? `Lookup failures: ${failures.join(" ")}`
        : "No forecast rows were returned by the weather provider.",
      source: "Open-Meteo",
    };
  }

  const summaryParts = forecasts.map((forecast) => {
    const mins = forecast.days.map((day) => day.minTemp).filter((value) => value !== null);
    const maxs = forecast.days.map((day) => day.maxTemp).filter((value) => value !== null);
    const min = mins.length > 0 ? Math.round(Math.min(...mins)) : null;
    const max = maxs.length > 0 ? Math.round(Math.max(...maxs)) : null;
    const avgRainValues = forecast.days
      .map((day) => day.precip)
      .filter((value) => value !== null);
    const avgRain = avgRainValues.length > 0
      ? Math.round(avgRainValues.reduce((sum, value) => sum + value, 0) / avgRainValues.length)
      : null;

    return `${forecast.location}: ${min !== null && max !== null ? `${min}-${max}C` : "temp n/a"}, avg rain chance ${avgRain !== null ? `${avgRain}%` : "n/a"}`;
  });

  const details = forecasts.map((forecast) => {
    const dayLines = forecast.days.map((day) => `- ${formatDailyForecastLine(day)}`).join("\n");
    return `${forecast.location}\n${dayLines}`;
  }).join("\n\n");

  const failureNote = failures.length > 0
    ? `\n\nPartial lookup failures: ${failures.join(" ")}`
    : "";
  const uncertaintyNote = "Forecast confidence is highest for the first 2-4 days and decreases later in the week.";

  return {
    summary: `Forecast for ${weekStart} to ${weekEnd}. ${summaryParts.join(" | ")}.`,
    details: `${details}\n\n${uncertaintyNote}${failureNote}`,
    source: "Open-Meteo",
  };
}

function cleanInformationalText(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text
    .replace(/^Council summary answer:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function prettifyUserFacingText(text) {
  if (typeof text !== "string") {
    return "";
  }

  let cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "";
  }

  const letters = cleaned.replace(/[^a-zA-Z]/g, "");
  const upperLetters = cleaned.replace(/[^A-Z]/g, "");
  const looksAllCaps = letters.length > 8 && (upperLetters.length / letters.length) > 0.85;

  if (looksAllCaps) {
    cleaned = cleaned.toLowerCase();
    cleaned = `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
  }

  if (!/[.!?]$/.test(cleaned)) {
    cleaned = `${cleaned}.`;
  }

  return cleaned;
}

function pickBestInformationalSummary(candidates) {
  for (const candidate of candidates) {
    const cleaned = cleanInformationalText(candidate);

    if (!cleaned) {
      continue;
    }

    if (isMetaInformationalAnswer(cleaned)) {
      continue;
    }

    return cleaned.endsWith(".") ? cleaned : `${cleaned}.`;
  }

  const fallback = cleanInformationalText(candidates.find((candidate) => typeof candidate === "string") ?? "");
  if (!fallback) {
    return "";
  }

  if (isMetaInformationalAnswer(fallback)) {
    return "No concrete factual result was produced by the council in this pass.";
  }

  return fallback.endsWith(".") ? fallback : `${fallback}.`;
}

async function buildDeterministicInformationalAnswer(question) {
  const syncBuilders = [
    () => buildCurrentDateTimeInformationalAnswer(question),
    () => buildMathInformationalAnswer(question),
    () => buildUnitConversionInformationalAnswer(question),
    () => buildArtemisFuelCostInformationalAnswer(question),
    () => buildTechGlossaryInformationalAnswer(question),
  ];
  const asyncBuilders = [
    () => buildCurrencyConversionInformationalAnswer(question),
    () => buildTimeInformationalAnswer(question),
    () => buildWeatherInformationalAnswer(question),
    () => buildUrlSummaryInformationalAnswer(question),
    () => buildDefinitionInformationalAnswer(question),
  ];

  for (const builder of syncBuilders) {
    const result = builder();
    if (result?.summary) {
      return result;
    }
  }

  for (const builder of asyncBuilders) {
    const result = await builder();
    if (result?.summary) {
      return result;
    }
  }

  return null;
}

async function resolveInformationalAnswer(
  run,
  members,
  conductorInformationalAnswer = "",
  conductorReasoningSummary = "",
) {
  if (run?.informationalAnswerCache) {
    return run.informationalAnswerCache;
  }

  const baseAnswer = synthesizeInformationalAnswer(members);
  const deterministicAnswer = await buildDeterministicInformationalAnswer(run.question);
  const bestCouncilOrConductor = pickBestInformationalSummary([
    conductorInformationalAnswer,
    baseAnswer,
  ]);

  let resolved = {
    summary: bestCouncilOrConductor || "Informational analysis returned without a concrete direct answer.",
    details: conductorReasoningSummary?.trim() || "",
    source: "council",
  };

  if (deterministicAnswer) {
    resolved = {
      summary: deterministicAnswer.summary,
      details: deterministicAnswer.details,
      source: deterministicAnswer.source,
    };
  }

  if (
    resolved.source === "council"
    && isPersonalQuery(run.question)
    && !looksActionablePersonalAnswer(`${resolved.summary}\n${resolved.details}`)
  ) {
    resolved = buildPersonalInformationalAnswer(run.question);
  }

  if (
    resolved.source === "council"
    && isMetaInformationalAnswer(resolved.summary)
  ) {
    const emergencyAnswer = await requestEmergencyDirectAnswer(run, "informational answer remained meta");
    const personalPlan = isPersonalQuery(run.question) ? buildPersonalInformationalAnswer(run.question) : null;
    const personalFallback = personalPlan?.summary ?? heuristicPersonalFallback(run.question);
    const shouldUseEmergencyAnswer = emergencyAnswer
      && (isPersonalQuery(run.question) || !isGenericPersonalTemplate(emergencyAnswer));

    if (shouldUseEmergencyAnswer) {
      resolved = {
        summary: emergencyAnswer.endsWith(".") ? emergencyAnswer : `${emergencyAnswer}.`,
        details: [resolved.details, "Direct-answer fallback was used to provide a concrete operator response."]
          .filter(Boolean)
          .join("\n"),
        source: "emergency-direct",
      };
    } else if (personalFallback) {
      resolved = {
        summary: personalFallback,
        details: [
          resolved.details,
          personalPlan?.details,
          "Personal-assistant fallback was used due to incomplete council detail.",
        ]
          .filter(Boolean)
          .join("\n"),
        source: "personal-fallback",
      };
    } else if (!personalFallback) {
      resolved = {
        summary: "The council returned analysis but no concrete direct answer in this pass.",
        details: [
          resolved.details,
          "Try asking again or enable a lighter council mode for faster direct-answer fallback.",
        ]
          .filter(Boolean)
          .join("\n"),
        source: "council",
      };
    }
  }

  run.informationalAnswerCache = resolved;
  return resolved;
}

function synthesizeInformationalAnswer(members) {
  const userFacingAnswers = [];
  const directReturns = [];
  const keyPoints = [];

  for (const memberId of MEMBER_IDS) {
    const member = members[memberId];
    if (!member || member.status !== "info") {
      continue;
    }

    const returnValue = extractActionReturnValue(member.conditions);
    if (returnValue) {
      directReturns.push(returnValue);
    }

    const userFacing = extractUserFacingAnswerFromConditions(member.conditions);
    if (userFacing) {
      userFacingAnswers.push(userFacing);
    }

    keyPoints.push(...extractKeyPointsFromResponse(member.response));
  }

  if (userFacingAnswers.length > 0) {
    const winner = mostFrequent(userFacingAnswers) ?? userFacingAnswers[0];
    return prettifyUserFacingText(winner);
  }

  if (directReturns.length > 0) {
    const winner = mostFrequent(directReturns) ?? directReturns[0];
    return prettifyUserFacingText(winner);
  }

  const uniquePoints = Array.from(new Set(keyPoints.map((point) => point.trim()))).filter(Boolean);
  if (uniquePoints.length > 0) {
    const usefulPoints = uniquePoints.filter((point) => !isMetaInformationalAnswer(point));
    const compact = (usefulPoints.length > 0 ? usefulPoints : uniquePoints).slice(0, 2).join(" ");
    return compact.endsWith(".") ? compact : `${compact}.`;
  }

  return "Informational query. The council is returning analysis rather than a yes/no decree.";
}

function synthesizeSeatAnswerSummary(members) {
  const seatAnswers = [];

  for (const memberId of MEMBER_IDS) {
    const member = members[memberId];
    if (!member || member.status === "error" || member.status === "processing") {
      continue;
    }

    const answer = extractSeatAnswerFromResponse(member.response);
    if (answer) {
      seatAnswers.push(answer.replace(/\s+/g, " ").trim());
    }
  }

  const uniqueAnswers = uniqueTrimmed(seatAnswers);
  if (uniqueAnswers.length === 0) {
    return null;
  }

  const winner = mostFrequent(seatAnswers);
  const preferred = winner ?? uniqueAnswers[0];
  return preferred.endsWith(".") ? preferred : `${preferred}.`;
}

function synthesizeCouncilDecision(
  aggregatedStatus,
  members,
  isYesOrNoAnswerable,
  informationalAnswerOverride = null,
) {
  const answerSummary = synthesizeSeatAnswerSummary(members);

  if (aggregatedStatus === "error") {
    return "Council summary answer: unavailable due to seat errors. Advisory only.";
  }

  if (aggregatedStatus === "info" || !isYesOrNoAnswerable) {
    return `Council summary answer: ${informationalAnswerOverride ?? synthesizeInformationalAnswer(members)}`;
  }

  const statuses = MEMBER_IDS.map((memberId) => members[memberId]?.status).filter(Boolean);
  const yesCount = statuses.filter((status) => status === "yes").length;
  const noCount = statuses.filter((status) => status === "no").length;
  const conditionalCount = statuses.filter((status) => status === "conditional").length;

  if (aggregatedStatus === "yes") {
    return answerSummary
      ? `Council summary answer: YES. ${answerSummary}`
      : "Council summary answer: YES. All three seats approve without blocking conditions.";
  }

  if (aggregatedStatus === "no") {
    return answerSummary
      ? `Council summary answer: NO. ${answerSummary}`
      : "Council summary answer: NO. At least one seat rejects the request.";
  }

  if (aggregatedStatus === "conditional") {
    if (noCount === 0 && yesCount > 0) {
      return answerSummary
        ? `Council summary answer: YES, WITH CONDITIONS. ${answerSummary}`
        : "Council summary answer: YES, WITH CONDITIONS. At least one seat requires caveats or constraints.";
    }

    if (conditionalCount > 0) {
      return answerSummary
        ? `Council summary answer: CONDITIONAL. ${answerSummary}`
        : "Council summary answer: CONDITIONAL. The seats require caveats before a firm yes/no.";
    }
  }

  return synthesizeDecisionText(aggregatedStatus, members, isYesOrNoAnswerable);
}

function synthesizeCouncilNarrative(
  question,
  aggregatedStatus,
  members,
  isYesOrNoAnswerable,
  informationalAnswerOverride = null,
  informationalDetails = "",
) {
  const lines = [];
  const summary = synthesizeCouncilDecision(
    aggregatedStatus,
    members,
    isYesOrNoAnswerable,
    informationalAnswerOverride,
  );
  const seatLines = [];
  const riskLines = [];

  for (const memberId of MEMBER_IDS) {
    const member = members[memberId];

    if (!member) {
      continue;
    }

    if (member.status === "error") {
      seatLines.push(`${toTitleCase(memberId)} reported a seat error and did not return a usable opinion.`);
      continue;
    }

    const keyPoints = extractKeyPointsFromResponse(member.response).slice(0, 2);
    const risks = extractRisksFromResponse(member.response).slice(0, 2);
    const seatAnswer = extractSeatAnswerFromResponse(member.response);
    const actionRecommendation = extractActionRecommendation(member.conditions);
    const confidenceSuffix = typeof member.confidence === "number"
      ? ` (confidence ${member.confidence.toFixed(2)})`
      : "";
    const stancePrefix = `${toTitleCase(memberId)}: ${readableSeatStatus(member)}${confidenceSuffix}.`;
    const rationale = keyPoints.length > 0
      ? ` ${keyPoints.join(" ")}`
      : "";
    const actionHint = actionRecommendation
      ? ` Suggested action: ${actionRecommendation}.`
      : "";
    const answerHint = seatAnswer
      ? ` Seat answer: ${seatAnswer}.`
      : "";

    seatLines.push(`${stancePrefix}${answerHint}${rationale}${actionHint}`);

    for (const risk of risks) {
      riskLines.push(`${toTitleCase(memberId)} risk: ${risk}`);
    }
  }

  lines.push(`Question: ${question || "N/A"}`);
  lines.push("");
  lines.push(`Council answer: ${summary}`);

  if (typeof informationalDetails === "string" && informationalDetails.trim()) {
    lines.push("");
    lines.push("Direct answer details:");
    lines.push(informationalDetails.trim());
  }

  lines.push("");
  lines.push("Seat reasoning:");
  lines.push(...(seatLines.length > 0 ? seatLines : ["No seat reasoning was available."]));

  if (riskLines.length > 0) {
    lines.push("");
    lines.push("Notable risks:");
    lines.push(...riskLines);
  }

  return lines.join("\n");
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

function buildOfflineResolvedSnapshot(run, {
  status = "info",
  decisionText = "",
  details = "",
  source = "offline-fallback",
  route = "council",
  councilExecuted = route !== "assistant-first",
  fallbackResolved = route !== "assistant-first",
  reason = "",
  dissentSummary = "Gateway fallback mode was used; full council synchronization was unavailable for this run.",
} = {}) {
  const safeDecision = typeof decisionText === "string" && decisionText.trim()
    ? decisionText.trim()
    : "A fallback answer was generated because the council gateway was unavailable.";
  const memberStatus = status === "info" ? "info" : "conditional";
  const members = {};

  for (const memberId of MEMBER_IDS) {
    members[memberId] = {
      status: route === "assistant-first" ? "neutral" : memberStatus,
      response: route === "assistant-first"
        ? "Seat was not executed in assistant-first routing."
        : safeDecision,
      conditions: route === "assistant-first"
        ? "Not executed."
        : `Fallback mode: ${source}.`,
      error: null,
      confidence: route === "assistant-first" ? null : 0.8,
      stance: route === "assistant-first"
        ? null
        : (memberStatus === "conditional" ? "conditional" : null),
    };
  }

  const answerLabel = route === "assistant-first"
    ? "Assistant answer"
    : "Council answer";
  const fullTextLines = [
    `Question: ${run?.question || "N/A"}`,
    "",
    `${answerLabel}: ${safeDecision}`,
  ];

  if (typeof details === "string" && details.trim()) {
    fullTextLines.push("");
    fullTextLines.push("Direct answer details:");
    fullTextLines.push(details.trim());
  }

  if (typeof reason === "string" && reason.trim()) {
    fullTextLines.push("");
    const reasonLabel = route === "assistant-first" ? "Route note" : "Fallback note";
    fullTextLines.push(`${reasonLabel}: ${reason.trim()}`);
  }

  return {
    id: run.id,
    question: run.question,
    isYesOrNoAnswerable: run.isYesOrNoAnswerable,
    sessionId: run.sessionKey,
    route,
    routeReason: typeof run?.routeReason === "string" ? run.routeReason : "",
    councilExecuted,
    outcomeCode: getOutcomeCode({
      route,
      councilExecuted,
      resolved: true,
      fallbackResolved,
    }),
    assistantResult: route === "assistant-first"
      ? {
        summary: safeDecision,
        details: typeof details === "string" ? details.trim() : "",
        source,
      }
      : null,
    seatResults: councilExecuted ? members : {},
    members,
    aggregation: {
      status,
      decisionText: safeDecision,
      dissentSummary,
      fullText: fullTextLines.join("\n"),
    },
    phase: "resolved",
    resolved: true,
  };
}

async function buildRunSnapshot(run) {
  if (run?.offlineResolvedSnapshot) {
    return {
      route: run.route ?? "council",
      routeReason: run.routeReason ?? "",
      councilExecuted: run.route === "council",
      outcomeCode: "fallback_resolved",
      assistantResult: run.route === "assistant-first"
        ? {
          summary: run.offlineResolvedSnapshot?.aggregation?.decisionText ?? "",
          details: "",
          source: "assistant-first",
        }
        : null,
      seatResults: run.route === "assistant-first" ? {} : run.offlineResolvedSnapshot?.members,
      ...run.offlineResolvedSnapshot,
    };
  }

  const members = getNeutralMembers();
  const currentSession = await getMagiSessionRecord(run.sessionKey);

  if (!currentSession || !existsSync(currentSession.filePath)) {
    return {
      id: run.id,
      question: run.question,
      isYesOrNoAnswerable: run.isYesOrNoAnswerable,
      sessionId: null,
      route: run.route ?? "council",
      routeReason: run.routeReason ?? "",
      councilExecuted: false,
      outcomeCode: "processing",
      assistantResult: null,
      seatResults: {},
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
      const finalPhaseText = collectFinalPhaseTextBlocks(message.content);
      const assistantHasFinalPhase = hasFinalAnswerPhase(message.content);
      const candidateFinalText = finalPhaseText || assistantText;

      if (isFinalAssistantText(candidateFinalText, assistantHasFinalPhase)) {
        finalText = candidateFinalText;
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
      } else if (childSessionKey || spawnStatus === "accepted" || spawnStatus === "ok") {
        // Clear stale spawn failures when a later spawn attempt for the same seat succeeds.
        spawnErrors.delete(memberId);
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

      if (liveMemberState) {
        members[memberId] = liveMemberState;

        // If a child session exists, keep waiting on that child instead of surfacing
        // a stale spawn-error from an earlier failed attempt.
        if (liveMemberState.status === "processing") {
          continue;
        }

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

  const hadSeatActivity = toolCallMap.size > 0 || childSessionKeys.size > 0 || spawnErrors.size > 0;
  const sessionStatus = normalizeLabel(currentSession.status);
  const directReplyWithoutCouncil = !hadSeatActivity
    && Boolean(finalText)
    && ["done", "timeout"].includes(sessionStatus);
  const allowDirectInformationalFallback = directReplyWithoutCouncil && !run.isYesOrNoAnswerable;
  let assistantFallbackResult = null;

  if (directReplyWithoutCouncil && !allowDirectInformationalFallback) {
    for (const memberId of MEMBER_IDS) {
      members[memberId] = {
        status: "error",
        response: "Seat was never spawned for this run.",
        conditions: "Conductor replied directly before council synchronization.",
        error: "No sessions_spawn calls were observed for this run.",
        confidence: null,
        stance: null,
      };
    }
  }

  if (allowDirectInformationalFallback) {
    run.route = "assistant-first";
    run.routeReason = "conductor_direct_without_seats";
    assistantFallbackResult = {
      summary: finalText,
      details: "Conductor returned a direct informational answer without spawning council seats.",
      source: "conductor-direct",
    };

    for (const memberId of MEMBER_IDS) {
      members[memberId] = {
        status: "neutral",
        response: "Seat was not executed in assistant-first routing.",
        conditions: "Not executed.",
        error: null,
        confidence: null,
        stance: null,
      };
    }
  }

  let statuses = MEMBER_IDS.map((memberId) => members[memberId].status);
  let allMembersResolved = statuses.every((status) =>
    ["yes", "no", "conditional", "info", "error"].includes(status)
  );
  const elapsedMs = now() - run.createdAt;
  const shouldSendStallNudge = (
    !allMembersResolved
    && !run.stallNudgeSent
    && elapsedMs >= getRunStallNudgeMs(run)
    && typeof run.credential === "string"
    && run.credential.trim()
  );

  if (shouldSendStallNudge) {
    run.stallNudgeSent = true;
    run.stallNudgeAt = now();

    try {
      await callGateway(
        "chat.send",
        {
          sessionKey: run.sessionKey,
          message: [
            "Council processing appears stalled.",
            "Complete this run now with available seat outputs.",
            "If any seat is unavailable, mark it unavailable and continue in degraded mode.",
            "Do not wait indefinitely for missing seats.",
          ].join("\n"),
          deliver: false,
          idempotencyKey: crypto.randomUUID(),
        },
        run.credential,
        {
          expectFinal: false,
          timeoutMs: GATEWAY_SUBMIT_TIMEOUT_MS,
        },
      );
    } catch {
      // If the stall nudge fails, timeout fallback below still prevents infinite processing.
    }
  }

  const runTimedOut = elapsedMs >= getRunTimeoutMs(run);
  const timedOutFallback = runTimedOut && !allMembersResolved;
  let emergencyDirectAnswer = "";
  let timeoutFallbackDetails = "";

  if (timedOutFallback) {
    for (const memberId of MEMBER_IDS) {
      if (members[memberId].status === "processing") {
        members[memberId] = {
          status: "error",
          response: "Seat timed out before returning a usable opinion.",
          conditions: "Run timeout fallback triggered.",
          error: "Seat exceeded timeout window.",
          confidence: null,
          stance: null,
        };
      }
    }

    statuses = MEMBER_IDS.map((memberId) => members[memberId].status);
    allMembersResolved = true;
    run.timedOutFallback = true;
    if (!run.isYesOrNoAnswerable && isDeterministicInformationalQuestion(run.question)) {
      const deterministicTimeoutAnswer = await buildDeterministicInformationalAnswer(run.question);
      if (deterministicTimeoutAnswer?.summary) {
        emergencyDirectAnswer = deterministicTimeoutAnswer.summary;
        timeoutFallbackDetails = deterministicTimeoutAnswer.details ?? "";
      }
    }

    if (!emergencyDirectAnswer) {
      emergencyDirectAnswer = (await requestEmergencyDirectAnswer(run, "council seats timed out")) ?? "";
    }

    if (!emergencyDirectAnswer && run.isYesOrNoAnswerable) {
      emergencyDirectAnswer = heuristicYesNoFallback(run.question) ?? "";
    }
    if (!emergencyDirectAnswer && !run.isYesOrNoAnswerable) {
      const personalPlan = isPersonalQuery(run.question) ? buildPersonalInformationalAnswer(run.question) : null;
      emergencyDirectAnswer = personalPlan?.summary || "";
      timeoutFallbackDetails = personalPlan?.details ?? timeoutFallbackDetails;
    }

    if (!emergencyDirectAnswer && !run.isYesOrNoAnswerable) {
      emergencyDirectAnswer = "I could not complete the full council run in time, but I can retry immediately if you want a fuller answer.";
    }
  }

  const finalTextMissing = finalText.trim().length === 0;
  const shouldNudgeForFinalDecree = (
    allMembersResolved
    && finalTextMissing
    && !directReplyWithoutCouncil
    && !timedOutFallback
  );

  if (
    shouldNudgeForFinalDecree
    && !run.finalizationNudgeSent
    && typeof run.credential === "string"
    && run.credential.trim()
  ) {
    run.finalizationNudgeSent = true;
    run.finalizationNudgeAt = now();

    try {
      await callGateway(
        "chat.send",
        {
          sessionKey: run.sessionKey,
          message: [
            "All council seats are resolved.",
            "Output one final MAGI COUNCIL SUMMARY now.",
            "Do not send progress updates and do not send NO_REPLY.",
            "Include: decision, informational_answer (for informational questions), dissent_summary, degraded_mode, execution_allowed, execution_plan, reasoning_summary.",
          ].join("\n"),
          deliver: false,
          idempotencyKey: crypto.randomUUID(),
        },
        run.credential,
        {
          expectFinal: false,
          timeoutMs: GATEWAY_SUBMIT_TIMEOUT_MS,
        },
      );
    } catch {
      // If nudge delivery fails, fallback aggregation below will still return.
    }
  }

  const waitingForNudgedFinal = shouldNudgeForFinalDecree
    && run.finalizationNudgeSent
    && typeof run.finalizationNudgeAt === "number"
    && (now() - run.finalizationNudgeAt) < FINALIZATION_NUDGE_GRACE_MS;

  if (waitingForNudgedFinal) {
    return {
      id: run.id,
      question: run.question,
      isYesOrNoAnswerable: run.isYesOrNoAnswerable,
      sessionId: currentSession.sessionId,
      route: run.route ?? "council",
      routeReason: run.routeReason ?? "",
      councilExecuted: true,
      outcomeCode: "processing",
      assistantResult: null,
      seatResults: members,
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

  const aggregatedStatusBase = allMembersResolved
    ? aggregateCouncilStatus(statuses, run.isYesOrNoAnswerable)
    : "processing";
  const parsedFinalVerdict = finalText ? parseFinalVerdict(finalText) : null;
  const conductorInformationalAnswer = parsedFinalVerdict
    ? (parsedFinalVerdict.informationalAnswer || parsedFinalVerdict.decisionText || "")
    : "";
  const conductorReasoningSummary = parsedFinalVerdict?.reasoningSummary ?? "";
  const informationalTimeoutNote = timedOutFallback
    ? "Council timeout fallback was used: one or more seats did not complete in time."
    : "";
  const informationalSynthesis = (
    allMembersResolved
    && (
      aggregatedStatusBase === "info"
      || !run.isYesOrNoAnswerable
      || (timedOutFallback && !run.isYesOrNoAnswerable)
    )
  )
    ? await resolveInformationalAnswer(
      run,
      members,
      conductorInformationalAnswer,
      [conductorReasoningSummary, informationalTimeoutNote].filter(Boolean).join("\n"),
    )
    : null;
  const informationalHasConcreteAnswer = (
    !run.isYesOrNoAnswerable
    && typeof informationalSynthesis?.summary === "string"
    && informationalSynthesis.summary.trim().length > 0
  );
  let aggregatedStatus = aggregatedStatusBase;

  if (informationalHasConcreteAnswer) {
    aggregatedStatus = "info";
  }

  if (
    timedOutFallback
    && (
      informationalHasConcreteAnswer
      || Boolean(emergencyDirectAnswer)
    )
  ) {
    aggregatedStatus = run.isYesOrNoAnswerable ? "conditional" : "info";
  }
  const timeoutFallbackDetail = timedOutFallback
    ? "Council timeout fallback was triggered because one or more seats did not complete in time."
    : "";
  const emergencyDecisionText = emergencyDirectAnswer
    ? emergencyDirectAnswer
    : "";
  const consensusDecisionText = allMembersResolved
    ? (
      emergencyDecisionText
      || synthesizeCouncilDecision(
        aggregatedStatus,
        members,
        run.isYesOrNoAnswerable,
        informationalSynthesis?.summary ?? null,
      )
    )
    : "";
  const consensusNarrativeText = allMembersResolved
    ? (
      emergencyDecisionText
      ? [
        `Question: ${run.question || "N/A"}`,
        "",
        `Council answer: ${emergencyDecisionText}`,
        ...(timeoutFallbackDetails ? ["", "Direct answer details:", timeoutFallbackDetails] : []),
        "",
        timeoutFallbackDetail,
      ].join("\n")
      : synthesizeCouncilNarrative(
        run.question,
        aggregatedStatus,
        members,
        run.isYesOrNoAnswerable,
        informationalSynthesis?.summary ?? null,
        [informationalSynthesis?.details, timeoutFallbackDetail].filter(Boolean).join("\n"),
      )
    )
    : "";
  const aggregation = (directReplyWithoutCouncil && !allowDirectInformationalFallback)
    ? {
      status: "error",
      decisionText: "Council synchronization failed: the conductor returned a direct reply without spawning MELCHIOR, BALTHASAR, and CASPER.",
      dissentSummary: "No seat opinions were produced for this run.",
      fullText: finalText.trim(),
    }
    : finalText
      ? (() => {
        return {
          status: aggregatedStatus,
          decisionText: consensusDecisionText || parsedFinalVerdict.decisionText,
          informationalAnswer: parsedFinalVerdict.informationalAnswer,
          dissentSummary: parsedFinalVerdict.dissentSummary || synthesizeDissentSummary(members),
          fullText: consensusNarrativeText || parsedFinalVerdict.fullText,
        };
      })()
      : allMembersResolved
        ? {
          status: aggregatedStatus,
          decisionText: consensusDecisionText,
          dissentSummary: synthesizeDissentSummary(members),
          fullText: consensusNarrativeText || consensusDecisionText,
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
      route: run.route ?? "council",
      routeReason: run.routeReason ?? "",
      councilExecuted: hadSeatActivity,
      outcomeCode: getOutcomeCode({
        route: run.route ?? "council",
        councilExecuted: hadSeatActivity,
        resolved: allMembersResolved,
        timedOutFallback,
        spawnMissing: directReplyWithoutCouncil && !allowDirectInformationalFallback,
      }),
    assistantResult: assistantFallbackResult,
    seatResults: hadSeatActivity ? members : {},
    members,
    aggregation,
    phase: allMembersResolved ? "resolved" : "member_processing",
    resolved: allMembersResolved,
  };

  if (snapshot.resolved && !run.historyLogged) {
    run.historyLogged = true;
    run.outcomeCode = snapshot.outcomeCode ?? getOutcomeCode({
      route: snapshot.route,
      councilExecuted: snapshot.councilExecuted,
      resolved: snapshot.resolved,
      timedOutFallback,
      spawnMissing: directReplyWithoutCouncil && !allowDirectInformationalFallback,
    });
    await appendRunHistory({
      id: run.id,
      question: run.question,
      createdAt: run.createdAt,
      resolvedAt: now(),
      isYesOrNoAnswerable: run.isYesOrNoAnswerable,
      route: snapshot.route,
      routeReason: snapshot.routeReason ?? "",
      councilExecuted: Boolean(snapshot.councilExecuted),
      outcomeCode: run.outcomeCode,
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
      const providedPassword = typeof body.password === "string" ? body.password.trim() : "";
      const password = providedPassword || DEFAULT_GATEWAY_PASSWORD;
      const ok = await verifyGatewayPassword(password);

      if (!ok) {
        sendJson(request, response, 401, {
          ok: false,
          error: "Gateway password was rejected.",
        });
        return;
      }

      await establishAuthSession(response, password);
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
    const session = await ensureBridgeAuthSession(request, response);

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

  const authSession = await ensureBridgeAuthSession(request, response);

  if (!authSession) {
    sendJson(request, response, 401, {
      error: "Authentication required.",
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/council/evaluate") {
    let run = null;
    let question = "";
    let options = { ...DEFAULT_RUNTIME_OPTIONS };
    let tuningNotes = [];

    try {
      const body = await readBody(request);
      question = typeof body.question === "string" ? body.question.trim() : "";
      const normalizedOptions = normalizeRuntimeOptions(body.options);

      if (!question) {
        sendJson(request, response, 400, {
          error: "A question is required.",
        });
        return;
      }

      const strictCouncilRequested = normalizedOptions.highStakesMode === "strict";
      const questionIsHighStakes = isHighStakesQuestion(question);
      const preTunedOptions = { ...normalizedOptions };

      if (strictCouncilRequested && questionIsHighStakes) {
        preTunedOptions.councilMode = "critical";
      } else if (
        strictCouncilRequested
        && (preTunedOptions.councilMode === "auto" || preTunedOptions.councilMode === "quick")
      ) {
        preTunedOptions.councilMode = "standard";
      }
      if (strictCouncilRequested) {
        preTunedOptions.executionPolicy = "allowlisted";
      }
      const optimized = optimizeRuntimeOptions(question, preTunedOptions);
      options = optimized.options;
      tuningNotes = optimized.tuningNotes;

      const runId = crypto.randomUUID();
      const sessionKey = `agent:magi:webui:${runId}`;
      const baseline = await getBaselineSnapshot(sessionKey);
      const runtimeEnvelope = buildRuntimeEnvelope(options);
      const routeDecision = resolveRouteDecision(options);
      run = {
        id: runId,
        sessionKey,
        credential: authSession.password,
        route: routeDecision.route,
        routeReason: routeDecision.reason,
        outcomeCode: "processing",
        question,
        options,
        isYesOrNoAnswerable: classifyQuestion(question),
        baseline,
        createdAt: now(),
        finalizationNudgeSent: false,
        finalizationNudgeAt: null,
        stallNudgeSent: false,
        stallNudgeAt: null,
        tuningNotes,
      };
      runs.set(runId, run);

      if (run.route === "assistant-first") {
        const assistantAnswer = await buildAssistantFirstAnswer(run);

        if (assistantAnswer?.summary) {
          const assistantSnapshot = buildOfflineResolvedSnapshot(run, {
            status: "info",
            decisionText: assistantAnswer.summary,
            details: assistantAnswer.details ?? "",
            source: assistantAnswer.source ?? "assistant-first",
            route: "assistant-first",
            reason: "Assistant-first mode resolved this prompt without council escalation.",
            dissentSummary: "Assistant-first route was used for a low-risk informational prompt; council seats were not escalated.",
            councilExecuted: false,
            fallbackResolved: false,
          });

          run.offlineResolvedSnapshot = assistantSnapshot;
          run.outcomeCode = assistantSnapshot.outcomeCode ?? "assistant_first_ok";
          run.historyLogged = true;
          await appendRunHistory({
            id: run.id,
            question: run.question,
            createdAt: run.createdAt,
            resolvedAt: now(),
            isYesOrNoAnswerable: run.isYesOrNoAnswerable,
            route: run.route,
            routeReason: run.routeReason,
            councilExecuted: false,
            outcomeCode: run.outcomeCode,
            status: assistantSnapshot.aggregation.status,
            decisionText: assistantSnapshot.aggregation.decisionText,
            dissentSummary: assistantSnapshot.aggregation.dissentSummary,
            members: {
              melchior: assistantSnapshot.members.melchior.status,
              balthasar: assistantSnapshot.members.balthasar.status,
              casper: assistantSnapshot.members.casper.status,
            },
          });

          sendJson(request, response, 200, {
            id: run.id,
            question,
            options,
            tuningNotes,
            isYesOrNoAnswerable: run.isYesOrNoAnswerable,
            route: run.route,
            routeReason: run.routeReason,
          });
          return;
        }
      }

      await callGateway(
        "chat.send",
        {
          sessionKey: run.sessionKey,
          message: `${runtimeEnvelope}\n\nUser question:\n${question}`,
          deliver: false,
          idempotencyKey: crypto.randomUUID(),
        },
        authSession.password,
        {
          expectFinal: false,
          timeoutMs: GATEWAY_SUBMIT_TIMEOUT_MS,
        },
      );

      sendJson(request, response, 200, {
        id: runId,
        question,
        options,
        tuningNotes,
        isYesOrNoAnswerable: run.isYesOrNoAnswerable,
        route: run.route ?? "council",
        routeReason: run.routeReason ?? "",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to submit the MAGI question.";

      if (run) {
        let offlineSnapshot = null;

        if (!run.isYesOrNoAnswerable) {
          const deterministic = await buildDeterministicInformationalAnswer(question);
          if (deterministic?.summary) {
            offlineSnapshot = buildOfflineResolvedSnapshot(run, {
              status: "info",
              decisionText: deterministic.summary,
              details: deterministic.details ?? "",
              source: deterministic.source ?? "deterministic-offline",
              route: run.route ?? "council",
              councilExecuted: false,
              reason: errorMessage,
            });
          } else if (isPersonalQuery(question)) {
            const personal = buildPersonalInformationalAnswer(question);
            offlineSnapshot = buildOfflineResolvedSnapshot(run, {
              status: "info",
              decisionText: personal.summary,
              details: personal.details ?? "",
              source: personal.source ?? "personal-offline",
              route: run.route ?? "council",
              councilExecuted: false,
              reason: errorMessage,
            });
          }
        } else {
          const yesNoFallback = heuristicYesNoFallback(question);
          if (yesNoFallback) {
            offlineSnapshot = buildOfflineResolvedSnapshot(run, {
              status: "conditional",
              decisionText: yesNoFallback,
              source: "yesno-heuristic-offline",
              route: run.route ?? "council",
              councilExecuted: false,
              reason: errorMessage,
            });
          }
        }

        if (offlineSnapshot) {
          run.offlineResolvedSnapshot = offlineSnapshot;
          run.outcomeCode = offlineSnapshot.outcomeCode ?? "fallback_resolved";
          run.historyLogged = true;
          await appendRunHistory({
            id: run.id,
            question: run.question,
            createdAt: run.createdAt,
            resolvedAt: now(),
            isYesOrNoAnswerable: run.isYesOrNoAnswerable,
            route: run.route ?? "council",
            routeReason: run.routeReason ?? "",
            councilExecuted: false,
            outcomeCode: run.outcomeCode,
            status: offlineSnapshot.aggregation.status,
            decisionText: offlineSnapshot.aggregation.decisionText,
            dissentSummary: offlineSnapshot.aggregation.dissentSummary,
            members: {
              melchior: offlineSnapshot.members.melchior.status,
              balthasar: offlineSnapshot.members.balthasar.status,
              casper: offlineSnapshot.members.casper.status,
            },
          });
          sendJson(request, response, 200, {
            id: run.id,
            question,
            options,
            tuningNotes,
            isYesOrNoAnswerable: run.isYesOrNoAnswerable,
            route: run.route ?? "council",
            routeReason: run.routeReason ?? "",
            fallbackMode: "offline",
          });
          return;
        }

        runs.delete(run.id);
      }

      sendJson(request, response, 502, {
        error: errorMessage,
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

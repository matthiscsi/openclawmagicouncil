import fs from "node:fs/promises";
import path from "node:path";

import { definePluginEntry } from "openclaw/plugin-sdk/core";

function textResult(text) {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

function expandPath(input) {
  if (!input) {
    return input;
  }

  if (input === "~") {
    return process.env.HOME ?? input;
  }

  if (input.startsWith("~/")) {
    return path.join(process.env.HOME ?? "", input.slice(2));
  }

  return input;
}

function normalizePath(input) {
  return path.resolve(expandPath(input));
}

function getPluginCfg(api) {
  const cfg = api.pluginConfig ?? {};
  return {
    serviceName: String(cfg.serviceName ?? "openclaw-magi.service"),
    gatewayConfigPath: normalizePath(String(cfg.gatewayConfigPath ?? "~/.openclaw-magi/openclaw.json")),
    logDir: normalizePath(String(cfg.logDir ?? "~/.openclaw-magi/logs")),
    allowedRoots: Array.isArray(cfg.allowedRoots)
      ? cfg.allowedRoots.map((value) => normalizePath(String(value)))
      : [normalizePath("~/.openclaw-magi")],
    logFiles: Array.isArray(cfg.logFiles)
      ? cfg.logFiles.map((value) => String(value))
      : ["gateway.log"],
  };
}

function ensureInsideAllowedRoots(targetPath, allowedRoots) {
  const resolved = normalizePath(targetPath);
  const allowed = allowedRoots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));

  if (!allowed) {
    throw new Error(`Path is outside the MAGI boundary: ${resolved}`);
  }

  return resolved;
}

function truncate(text, maxChars = 4000) {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars)}\n...[truncated]`;
}

async function runCommand(api, command, args) {
  const result = await api.runtime.system.runCommandWithTimeout(command, args, {
    timeoutMs: 15000,
  });

  const stdout = String(result?.stdout ?? "").trim();
  const stderr = String(result?.stderr ?? "").trim();
  const exitCode = Number(result?.exitCode ?? 0);

  return { stdout, stderr, exitCode };
}

async function readGatewayConfig(api) {
  const cfg = getPluginCfg(api);
  const filePath = ensureInsideAllowedRoots(cfg.gatewayConfigPath, cfg.allowedRoots);
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export default definePluginEntry({
  id: "magi-admin",
  name: "MAGI Admin",
  description: "Allowlisted MAGI-only admin tools.",
  register(api) {
    api.registerTool(
      {
        name: "magi_health_snapshot",
        description: "Summarize the MAGI gateway service, model seats, and configured access surfaces.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {}
        },
        async execute() {
          const pluginCfg = getPluginCfg(api);
          const service = await runCommand(api, "systemctl", ["--user", "show", pluginCfg.serviceName, "--property=ActiveState,SubState,UnitFileState"]);
          const docker = await runCommand(api, "docker", ["info", "--format", "{{json .ServerVersion}}"]);
          const gatewayConfig = await readGatewayConfig(api);
          const agentIds = Array.isArray(gatewayConfig?.agents?.list) ? gatewayConfig.agents.list.map((agent) => agent.id) : [];
          const bindings = Array.isArray(gatewayConfig?.bindings) ? gatewayConfig.bindings.length : 0;
          const channels = gatewayConfig?.channels ? Object.keys(gatewayConfig.channels) : [];

          return textResult(
            [
              `service=${pluginCfg.serviceName}`,
              `service_status=${service.stdout || service.stderr || "unknown"}`,
              `docker_status=${docker.exitCode === 0 ? "available" : "unavailable"}`,
              `agents=${agentIds.join(", ") || "none"}`,
              `bindings=${bindings}`,
              `channels=${channels.join(", ") || "web-ui-only"}`
            ].join("\n")
          );
        }
      },
      { optional: true }
    );

    api.registerTool(
      {
        name: "magi_gateway_restart",
        description: "Restart the MAGI gateway user service. Only affects the configured MAGI service.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {}
        },
        async execute() {
          const pluginCfg = getPluginCfg(api);
          const restart = await runCommand(api, "systemctl", ["--user", "restart", pluginCfg.serviceName]);
          const status = await runCommand(api, "systemctl", ["--user", "is-active", pluginCfg.serviceName]);

          return textResult(
            [
              `restart_exit=${restart.exitCode}`,
              `restart_stderr=${restart.stderr || "none"}`,
              `service_active=${status.stdout || "unknown"}`
            ].join("\n")
          );
        }
      },
      { optional: true }
    );

    api.registerTool(
      {
        name: "magi_log_tail",
        description: "Read the tail of an allowlisted MAGI log file.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            "name": {
              type: "string"
            },
            "lines": {
              type: "integer",
              minimum: 1,
              maximum: 400
            }
          },
          required: ["name"]
        },
        async execute(_id, params) {
          const pluginCfg = getPluginCfg(api);
          const logName = String(params.name);

          if (!pluginCfg.logFiles.includes(logName)) {
            throw new Error(`Log file is not allowlisted: ${logName}`);
          }

          const logPath = ensureInsideAllowedRoots(path.join(pluginCfg.logDir, logName), pluginCfg.allowedRoots);
          const raw = await fs.readFile(logPath, "utf8");
          const lines = raw.split(/\r?\n/);
          const tail = lines.slice(-Number(params.lines ?? 80)).join("\n");

          return textResult(truncate(tail, 6000));
        }
      },
      { optional: true }
    );

    api.registerTool(
      {
        name: "magi_discord_health",
        description: "Report whether Discord is configured for MAGI and whether recent logs mention Discord failures.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {}
        },
        async execute() {
          const pluginCfg = getPluginCfg(api);
          const cfg = await readGatewayConfig(api);
          const discord = cfg?.channels?.discord;
          const configured = Boolean(discord?.accounts?.default);
          const guildCount = discord?.accounts?.default?.guilds ? Object.keys(discord.accounts.default.guilds).length : 0;
          let logSummary = "gateway.log not found";

          try {
            const logPath = ensureInsideAllowedRoots(path.join(pluginCfg.logDir, "gateway.log"), pluginCfg.allowedRoots);
            const raw = await fs.readFile(logPath, "utf8");
            const recent = raw
              .split(/\r?\n/)
              .filter((line) => /discord/i.test(line))
              .slice(-20)
              .join("\n");

            logSummary = recent ? truncate(recent, 2500) : "no recent discord log lines";
          }
          catch {
            logSummary = "gateway.log not found";
          }

          return textResult(
            [
              `configured=${configured}`,
              `guilds=${guildCount}`,
              `token_env_present=${Boolean(process.env.DISCORD_BOT_TOKEN)}`,
              "",
              logSummary
            ].join("\n")
          );
        }
      },
      { optional: true }
    );
  }
});

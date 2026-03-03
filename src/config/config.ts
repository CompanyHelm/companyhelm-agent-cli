import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { CliError } from "../errors.js";

const configSchema = z.object({
  agent_api_url: z.string().trim().min(1, "agent_api_url is required."),
  token: z.string().trim().min(1, "token is required."),
});

export interface AgentCliConfig {
  agent_api_url: string;
  token: string;
}

export function defaultConfigPath(): string {
  return join(homedir(), ".config", "companyhelm-agent-cli", "config.json");
}

export function loadAgentCliConfig(configPath = defaultConfigPath()): AgentCliConfig {
  let rawConfig: string;
  try {
    rawConfig = readFileSync(configPath, "utf8");
  } catch {
    throw new CliError(
      "CONFIG_ERROR",
      `Config file not found at '${configPath}'. Create it with 'agent_api_url' and 'token'.`,
    );
  }

  let parsedConfig: unknown;
  try {
    parsedConfig = JSON.parse(rawConfig);
  } catch {
    throw new CliError("CONFIG_ERROR", `Config file '${configPath}' must contain valid JSON.`);
  }

  const result = configSchema.safeParse(parsedConfig);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const issuePath = firstIssue?.path.length ? firstIssue.path.join(".") : "config";
    const issueMessage = firstIssue?.message ?? "invalid config";
    throw new CliError("CONFIG_ERROR", `Invalid config in '${configPath}': ${issuePath}: ${issueMessage}`);
  }

  return result.data;
}

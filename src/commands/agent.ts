import { AgentId, ProviderId, isLegacyConfig, readRuntimeConfig } from "../runtime/config.js";
import { createTraceDir, generateRunId } from "../runtime/artifacts.js";
import { migrateLegacyConfig } from "../runtime/migration.js";
import { resolveModel, resolvePrompt, resolveProvider } from "../runtime/roles.js";
import { validateProviderAvailable } from "../runtime/validation.js";
import { claudeAdapter } from "../runtime/providers/claude.js";
import { codexAdapter } from "../runtime/providers/codex.js";
import { opencodeAdapter } from "../runtime/providers/opencode.js";
import type { ProviderAdapter } from "../runtime/provider-adapter.js";
import type { AgentflowRuntimeConfig } from "../runtime/config.js";
import { readConfig } from "../core/schema.js";
import * as logger from "../utils/logger.js";

const ADAPTERS: Record<string, ProviderAdapter> = {
  "claude-code": claudeAdapter,
  codex: codexAdapter,
  opencode: opencodeAdapter,
};

export interface AgentRunOptions {
  task: string;
  provider?: string;
  model?: string;
  feature?: string;
  json?: boolean;
}

export async function runAgentCommand(
  cwd: string,
  roleArg: string,
  options: AgentRunOptions,
): Promise<void> {
  // Validate role
  const roleResult = AgentId.safeParse(roleArg);
  if (!roleResult.success) {
    logger.error(`Invalid role "${roleArg}". Expected: planner, implementer, tester, documenter, classifier.`);
    process.exitCode = 1;
    return;
  }
  const role = roleResult.data;

  // Read config — support both runtime-first and legacy
  let runtimeConfig: AgentflowRuntimeConfig | null = await readRuntimeConfig(cwd);

  if (!runtimeConfig) {
    // Try legacy
    const legacyConfig = await readConfig(cwd);
    if (!legacyConfig) {
      logger.error("No .agentflow.json found. Run agentflow init first.");
      process.exitCode = 1;
      return;
    }
    if (!isLegacyConfig(legacyConfig)) {
      logger.error("Config format unrecognized.");
      process.exitCode = 1;
      return;
    }
    logger.warn("Legacy config detected — running with in-memory migration. Run agentflow update to persist.");
    runtimeConfig = migrateLegacyConfig(legacyConfig as never);
  }

  // Validate provider option
  let cliProvider: ProviderId | undefined;
  if (options.provider) {
    const providerResult = ProviderId.safeParse(options.provider);
    if (!providerResult.success) {
      logger.error(`Invalid provider "${options.provider}". Expected: claude-code, codex, opencode.`);
      process.exitCode = 1;
      return;
    }
    cliProvider = providerResult.data;
  }

  if (!runtimeConfig.roles[role]) {
    logger.error(`Role "${role}" is not configured. Run agentflow init to regenerate configuration.`);
    process.exitCode = 1;
    return;
  }

  const provider = resolveProvider(role, runtimeConfig, cliProvider);
  const model = resolveModel(role, provider, runtimeConfig, options.model);
  const prompt = resolvePrompt(role, provider, runtimeConfig);

  // Validate provider binary
  try {
    await validateProviderAvailable(provider);
  } catch (err) {
    logger.error((err as Error).message);
    process.exitCode = 1;
    return;
  }

  const runId = generateRunId();
  const traceDirPath = await createTraceDir(cwd, runId);

  const adapter = ADAPTERS[provider];
  if (!adapter) {
    logger.error(`No adapter found for provider "${provider}".`);
    process.exitCode = 1;
    return;
  }

  const result = await adapter.run({
    cwd,
    role,
    provider,
    model,
    sandbox: runtimeConfig.roles[role].sandbox,
    effort: runtimeConfig.roles[role].effort,
    prompt,
    task: options.task,
    featureSlug: options.feature,
    traceDir: traceDirPath,
    json: options.json,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.ok) {
      logger.success(`${role} (${provider}/${model}) completed.`);
      if (result.summary) {
        console.log(result.summary);
      }
    } else {
      logger.error(`${role} failed: ${result.message ?? result.code ?? "unknown error"}`);
    }
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

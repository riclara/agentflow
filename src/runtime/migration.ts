import { AGENTFLOW_SCHEMA_URL, AGENTFLOW_VERSION } from "../core/schema.js";
import { renderDocumenterPrompt } from "../templates/prompts/documenter.js";
import { renderImplementerPrompt } from "../templates/prompts/implementer.js";
import { renderPlannerPrompt } from "../templates/prompts/planner.js";
import { renderTesterPrompt } from "../templates/prompts/tester.js";
import type { AgentflowRuntimeConfig, ProviderId } from "./config.js";

/**
 * Minimal shape of a legacy .agentflow.json (models-based, no roles).
 * Pure type — no Zod validation at this layer.
 */
export interface LegacyAgentflowConfig {
  $schema: string;
  version: string;
  tools: string[];
  models: {
    planner: string;
    implementer: string;
    tester: string;
    documenter: string;
  };
  workflow: {
    maxReviewIterations: number;
    testerExecutes: boolean;
    testerAutoLoop: boolean;
    planGranularity: string;
  };
  project: {
    language: string;
    framework: string;
    testRunner: string;
  };
  managedFiles?: Record<string, string>;
}

/**
 * Convert a legacy config object into a runtime-first config object.
 * Pure and idempotent — does not write to disk.
 */
export function migrateLegacyConfig(legacy: LegacyAgentflowConfig): AgentflowRuntimeConfig {
  const tools = legacy.tools as ProviderId[];

  // Default provider: codex if available, else first tool
  const defaultProvider: ProviderId = tools.includes("codex") ? "codex" : (tools[0] as ProviderId);

  // Build a minimal AgentflowConfig shape for the prompt renderers
  const configForPrompts = {
    $schema: legacy.$schema,
    version: legacy.version,
    tools,
    models: legacy.models,
    workflow: legacy.workflow,
    project: legacy.project,
    managedFiles: legacy.managedFiles ?? {},
  };

  const makeRole = (
    agentId: "planner" | "implementer" | "tester" | "documenter",
    model: string,
    promptBase: string,
  ) => ({
    provider: defaultProvider,
    model,
    sandbox: "workspace-write" as const,
    prompt: {
      base: promptBase,
      providerOverrides: {},
    },
    providerModels: {},
  });

  return {
    $schema: AGENTFLOW_SCHEMA_URL,
    version: AGENTFLOW_VERSION,
    tools,
    workflow: legacy.workflow,
    project: legacy.project,
    runtime: {
      mode: "cli-runtime",
      traceDir: ".agentflow/runs",
      defaultProvider,
    },
    roles: {
      planner: makeRole("planner", legacy.models.planner, renderPlannerPrompt(configForPrompts as never)),
      implementer: makeRole("implementer", legacy.models.implementer, renderImplementerPrompt(configForPrompts as never)),
      tester: makeRole("tester", legacy.models.tester, renderTesterPrompt(configForPrompts as never)),
      documenter: makeRole("documenter", legacy.models.documenter, renderDocumenterPrompt(configForPrompts as never)),
    },
  };
}

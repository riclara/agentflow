import path from "node:path";

import { exists, readJson, writeJson } from "../utils/fs.js";

// x-release-please-start-version
export const AGENTFLOW_VERSION = "1.0.6";
// x-release-please-end
export const NPM_PACKAGE_NAME = "@riclara/agentflow";
export const AGENTFLOW_SCHEMA_URL = "https://unpkg.com/@riclara/agentflow/schema.json";
export const CONFIG_FILE = ".agentflow.json";

export const TOOL_IDS = ["claude-code", "codex", "opencode"] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export const AGENT_IDS = [
  "planner",
  "implementer",
  "tester",
  "documenter",
] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export interface AgentflowModels {
  planner: string;
  implementer: string;
  tester: string;
  documenter: string;
}

export interface AgentflowWorkflow {
  maxReviewIterations: number;
  planGranularity: string;
  testerExecutes: boolean;
  testerAutoLoop: boolean;
}

export interface AgentflowProject {
  language: string;
  framework: string;
  testRunner: string;
}

export interface AgentflowConfig {
  $schema: string;
  version: string;
  tools: ToolId[];
  models: AgentflowModels;
  workflow: AgentflowWorkflow;
  project: AgentflowProject;
  managedFiles: Record<string, string>;
}

export interface ConfigCreateInput {
  tools: ToolId[];
  models?: Partial<AgentflowModels>;
  workflow?: Partial<AgentflowWorkflow>;
  project?: Partial<AgentflowProject>;
  managedFiles?: Record<string, string>;
}

export const DEFAULT_MODELS: AgentflowModels = {
  planner: "opus",
  implementer: "sonnet",
  tester: "sonnet",
  documenter: "haiku",
};

export const DEFAULT_WORKFLOW: AgentflowWorkflow = {
  maxReviewIterations: 3,
  planGranularity: "adaptive",
  testerExecutes: true,
  testerAutoLoop: true,
};

export const DEFAULT_PROJECT: AgentflowProject = {
  language: "TypeScript",
  framework: "Express",
  testRunner: "npx vitest run",
};

const PATH_ALIASES: Record<string, string> = {
  "workflow.maxIterations": "workflow.maxReviewIterations",
};

export function createConfig(input: ConfigCreateInput): AgentflowConfig {
  return {
    $schema: AGENTFLOW_SCHEMA_URL,
    version: AGENTFLOW_VERSION,
    tools: [...input.tools],
    models: { ...DEFAULT_MODELS, ...input.models },
    workflow: { ...DEFAULT_WORKFLOW, ...input.workflow },
    project: { ...DEFAULT_PROJECT, ...input.project },
    managedFiles: { ...input.managedFiles },
  };
}

export function normalizePathAlias(targetPath: string): string {
  return PATH_ALIASES[targetPath] ?? targetPath;
}

export function validateConfig(value: unknown): asserts value is AgentflowConfig {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid .agentflow.json: expected an object.");
  }

  const config = value as Partial<AgentflowConfig>;

  if (config.$schema !== AGENTFLOW_SCHEMA_URL) {
    throw new Error(`Invalid .agentflow.json: $schema must be "${AGENTFLOW_SCHEMA_URL}".`);
  }

  if (typeof config.version !== "string") {
    throw new Error("Invalid .agentflow.json: version must be a string.");
  }

  if (!Array.isArray(config.tools) || config.tools.some((tool) => !TOOL_IDS.includes(tool as ToolId))) {
    throw new Error("Invalid .agentflow.json: tools must be an array of supported tool ids.");
  }

  for (const section of ["models", "workflow", "project", "managedFiles"] as const) {
    if (!config[section] || typeof config[section] !== "object") {
      throw new Error(`Invalid .agentflow.json: ${section} is required.`);
    }
  }

  for (const agentId of AGENT_IDS) {
    if (typeof config.models?.[agentId] !== "string") {
      throw new Error(`Invalid .agentflow.json: models.${agentId} must be a string.`);
    }
  }

  if (!Number.isInteger(config.workflow?.maxReviewIterations) || (config.workflow?.maxReviewIterations ?? 0) < 1) {
    throw new Error("Invalid .agentflow.json: workflow.maxReviewIterations must be an integer >= 1.");
  }

  for (const key of ["planGranularity"] as const) {
    if (typeof config.workflow?.[key] !== "string") {
      throw new Error(`Invalid .agentflow.json: workflow.${key} must be a string.`);
    }
  }

  for (const key of ["testerExecutes", "testerAutoLoop"] as const) {
    if (typeof config.workflow?.[key] !== "boolean") {
      throw new Error(`Invalid .agentflow.json: workflow.${key} must be a boolean.`);
    }
  }

  for (const key of ["language", "framework", "testRunner"] as const) {
    if (typeof config.project?.[key] !== "string") {
      throw new Error(`Invalid .agentflow.json: project.${key} must be a string.`);
    }
  }

  if (
    !config.managedFiles ||
    Array.isArray(config.managedFiles) ||
    Object.values(config.managedFiles).some((item) => typeof item !== "string")
  ) {
    throw new Error("Invalid .agentflow.json: managedFiles must be an object of string values.");
  }
}

export async function readConfig(cwd: string): Promise<AgentflowConfig | null> {
  const configPath = path.join(cwd, CONFIG_FILE);
  if (!(await exists(configPath))) {
    return null;
  }

  const config = await readJson(configPath);
  validateConfig(config);
  return config;
}

export async function writeConfig(cwd: string, config: AgentflowConfig): Promise<void> {
  const configPath = path.join(cwd, CONFIG_FILE);
  await writeJson(configPath, config);
}

export function getConfigValue(config: AgentflowConfig, targetPath: string): unknown {
  const normalized = normalizePathAlias(targetPath);
  return normalized.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, config);
}

export function setConfigValue(config: AgentflowConfig, targetPath: string, rawValue: string): AgentflowConfig {
  const normalized = normalizePathAlias(targetPath);
  const segments = normalized.split(".");
  const cloned: AgentflowConfig = JSON.parse(JSON.stringify(config)) as AgentflowConfig;

  let cursor = cloned as unknown as Record<string, unknown>;
  for (const segment of segments.slice(0, -1)) {
    const next = cursor[segment];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      throw new Error(`Unknown config path: ${targetPath}`);
    }
    cursor = next as Record<string, unknown>;
  }

  const leaf = segments.at(-1);
  if (!leaf) {
    throw new Error(`Unknown config path: ${targetPath}`);
  }

  if (!(leaf in cursor)) {
    throw new Error(`Unknown config path: ${targetPath}`);
  }

  cursor[leaf] = coerceConfigValue(rawValue, cursor[leaf]);
  validateConfig(cloned);
  return cloned;
}

function coerceConfigValue(rawValue: string, previousValue: unknown): unknown {
  if (typeof previousValue === "number") {
    const value = Number.parseInt(rawValue, 10);
    if (Number.isNaN(value)) {
      throw new Error(`Expected a numeric value, received "${rawValue}".`);
    }
    return value;
  }

  if (typeof previousValue === "boolean") {
    if (rawValue === "true") {
      return true;
    }
    if (rawValue === "false") {
      return false;
    }
    throw new Error(`Expected "true" or "false", received "${rawValue}".`);
  }

  return rawValue;
}

import path from "node:path";

import { readTextIfExists } from "../utils/fs.js";
import type { AgentflowConfig, ToolId } from "./schema.js";

export type TemplateHealthStatus = "healthy" | "stale" | "incompatible";

interface TemplateHealthRequirement {
  needle: string;
  description: string;
}

interface TemplateHealthDefinition {
  key: string;
  label: string;
  path: string;
  tool: ToolId;
  requirements: TemplateHealthRequirement[];
}

export interface TemplateHealthCheckResult {
  key: string;
  label: string;
  path: string;
  tool: ToolId;
  status: TemplateHealthStatus;
  reason: string;
  managed: boolean;
  missingRequirements: string[];
}

export interface TemplateHealthReport {
  status: TemplateHealthStatus;
  checks: TemplateHealthCheckResult[];
}

const plannerRequirements: TemplateHealthRequirement[] = [
  { needle: "FEATURE_DIR/plan.md", description: "feature plan artifact path" },
  { needle: "FEATURE_DIR/review.md", description: "feature review artifact path" },
  { needle: "## Implementation Tasks", description: "Implementation Tasks section" },
  { needle: "## Test Tasks", description: "Test Tasks section" },
  { needle: "## Test Files", description: "Test Files section" },
  { needle: "## Status: APPROVED | NEEDS_CHANGES", description: "review status contract" },
];

const testerRequirements: TemplateHealthRequirement[] = [
  { needle: "## Test Tasks", description: "Test Tasks instructions" },
  { needle: "## Test Files", description: "Test Files instructions" },
  { needle: "do NOT create extra files", description: "unplanned test file guardrail" },
  { needle: "## Status: NEEDS_CHANGES", description: "test failure status contract" },
];

const skillRequirements: TemplateHealthRequirement[] = [
  { needle: "docs/features/", description: "feature directory protocol" },
  { needle: "activity.log", description: "activity log protocol" },
  { needle: "## Implementation Tasks", description: "implementation task protocol" },
  { needle: "## Test Tasks", description: "test task protocol" },
  { needle: "PAUSED_RATE_LIMIT", description: "rate-limit pause protocol" },
  { needle: "Resume from Phase", description: "explicit resume instructions" },
];

export async function collectTemplateHealth(cwd: string, config: AgentflowConfig): Promise<TemplateHealthReport> {
  const definitions = getTemplateHealthDefinitions(config);
  const checks = await Promise.all(definitions.map((definition) => evaluateDefinition(cwd, config, definition)));

  return {
    status: summarizeHealthStatus(checks.map((check) => check.status)),
    checks,
  };
}

export function summarizeHealthStatus(statuses: TemplateHealthStatus[]): TemplateHealthStatus {
  if (statuses.includes("incompatible")) {
    return "incompatible";
  }

  if (statuses.includes("stale")) {
    return "stale";
  }

  return "healthy";
}

function getTemplateHealthDefinitions(config: AgentflowConfig): TemplateHealthDefinition[] {
  const definitions: TemplateHealthDefinition[] = [];

  if (config.tools.includes("claude-code")) {
    definitions.push(
      {
        key: "claude-planner",
        label: "Claude planner",
        tool: "claude-code",
        path: ".claude/agents/planner.md",
        requirements: [
          { needle: "tools: Read, Write, Glob, Grep", description: "planner write capability" },
          ...plannerRequirements,
        ],
      },
      {
        key: "claude-tester",
        label: "Claude tester",
        tool: "claude-code",
        path: ".claude/agents/tester.md",
        requirements: testerRequirements,
      },
      {
        key: "claude-skill",
        label: "Claude skill",
        tool: "claude-code",
        path: ".claude/skills/agentflow/SKILL.md",
        requirements: skillRequirements,
      },
    );
  }

  if (config.tools.includes("codex")) {
    definitions.push(
      {
        key: "codex-planner",
        label: "Codex planner",
        tool: "codex",
        path: ".codex/agents/planner.toml",
        requirements: [
          { needle: 'sandbox_mode = "workspace-write"', description: "workspace-write sandbox" },
          ...plannerRequirements,
        ],
      },
      {
        key: "codex-tester",
        label: "Codex tester",
        tool: "codex",
        path: ".codex/agents/tester.toml",
        requirements: testerRequirements,
      },
      {
        key: "codex-skill",
        label: "Codex skill",
        tool: "codex",
        path: ".agents/skills/agentflow/SKILL.md",
        requirements: skillRequirements,
      },
    );
  }

  if (config.tools.includes("opencode")) {
    definitions.push(
      {
        key: "opencode-planner",
        label: "OpenCode planner",
        tool: "opencode",
        path: ".opencode/agents/planner.md",
        requirements: [
          { needle: "write: true", description: "planner write capability" },
          { needle: "edit: false", description: "planner write-only guardrail" },
          ...plannerRequirements,
        ],
      },
      {
        key: "opencode-tester",
        label: "OpenCode tester",
        tool: "opencode",
        path: ".opencode/agents/tester.md",
        requirements: testerRequirements,
      },
    );
  }

  return definitions;
}

async function evaluateDefinition(
  cwd: string,
  config: AgentflowConfig,
  definition: TemplateHealthDefinition,
): Promise<TemplateHealthCheckResult> {
  const managed = definition.path in config.managedFiles;
  if (!managed) {
    return {
      key: definition.key,
      label: definition.label,
      path: definition.path,
      tool: definition.tool,
      status: "incompatible",
      reason: "not managed by agentflow",
      managed,
      missingRequirements: [],
    };
  }

  const content = await readTextIfExists(path.join(cwd, definition.path));
  if (content === null) {
    return {
      key: definition.key,
      label: definition.label,
      path: definition.path,
      tool: definition.tool,
      status: "incompatible",
      reason: "managed file is missing",
      managed,
      missingRequirements: [],
    };
  }

  const missingRequirements = definition.requirements
    .filter((requirement) => !content.includes(requirement.needle))
    .map((requirement) => requirement.description);

  if (missingRequirements.length > 0) {
    return {
      key: definition.key,
      label: definition.label,
      path: definition.path,
      tool: definition.tool,
      status: "stale",
      reason: `missing ${joinList(missingRequirements)}`,
      managed,
      missingRequirements,
    };
  }

  return {
    key: definition.key,
    label: definition.label,
    path: definition.path,
    tool: definition.tool,
    status: "healthy",
    reason: "meets v3 invariants",
    managed,
    missingRequirements: [],
  };
}

function joinList(items: string[]): string {
  if (items.length === 1) {
    return items[0]!;
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

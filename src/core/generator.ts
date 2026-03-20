import path from "node:path";

import { renderClaudeAgent } from "../templates/claude-code/agent.js";
import { renderClaudeWorkflowSection } from "../templates/claude-code/claude-md.js";
import { renderClaudeSkill } from "../templates/claude-code/skill.js";
import { renderCodexAgent } from "../templates/codex/agent-toml.js";
import { renderAgentsMdSection } from "../templates/codex/agents-md.js";
import { renderCodexSkill } from "../templates/codex/skill.js";
import { renderOpenCodeAgent } from "../templates/opencode/agent.js";
import { renderOpenCodeAgentsConfig } from "../templates/opencode/config-json.js";
import { exists, ensureDir, readTextIfExists, writeText } from "../utils/fs.js";
import {
  buildManagedFilesMap,
  extractModelFromFile,
  mergeCodexConfig,
  mergeMarkedSection,
  mergeOpencodeJson,
} from "./merger.js";
import { mapModelsForTool } from "./models.js";
import type { AgentflowConfig, AgentId, ToolId } from "./schema.js";

export type GenerationAction = "CREATE" | "OVERWRITE" | "MERGE" | "SKIP";
export type GenerationKind = "file" | "directory";
export type GenerationStrategy = "write" | "merge-markers" | "merge-json" | "merge-codex-config";

export interface FileDefinition {
  path: string;
  tool?: ToolId;
  kind: GenerationKind;
  strategy: GenerationStrategy;
  partial?: boolean;
  render?: (config: AgentflowConfig) => string;
}

export interface PlannedGeneration {
  path: string;
  kind: GenerationKind;
  action: GenerationAction;
  strategy: GenerationStrategy;
  content?: string;
  partial?: boolean;
}

export interface GenerationOptions {
  claudeMdMode?: "merge" | "skip" | "overwrite";
  agentsMdMode?: "merge" | "skip" | "overwrite";
}

export function getDefinitions(config: AgentflowConfig, includeExistingCodexConfig = false): FileDefinition[] {
  const definitions: FileDefinition[] = [
    {
      path: "docs",
      kind: "directory",
      strategy: "write",
    },
  ];

  if (config.tools.includes("claude-code")) {
    definitions.push(
      {
        path: ".claude/skills/agentflow/SKILL.md",
        tool: "claude-code",
        kind: "file",
        strategy: "write",
        render: (currentConfig) => renderClaudeSkill(currentConfig),
      },
      ...buildAgentDefinitions(
        "claude-code",
        [".claude/agents/planner.md", ".claude/agents/implementer.md", ".claude/agents/tester.md", ".claude/agents/documenter.md"],
        (agentId, currentConfig) => renderClaudeAgent(agentId, currentConfig, mapModelsForTool("claude-code", currentConfig.models)),
      ),
      {
        path: "CLAUDE.md",
        tool: "claude-code",
        kind: "file",
        strategy: "merge-markers",
        partial: true,
        render: (currentConfig) => renderClaudeWorkflowSection(currentConfig),
      },
    );
  }

  if (config.tools.includes("codex")) {
    definitions.push(
      ...buildAgentDefinitions(
        "codex",
        [
          ".codex/agents/planner.toml",
          ".codex/agents/implementer.toml",
          ".codex/agents/tester.toml",
          ".codex/agents/documenter.toml",
        ],
        (agentId, currentConfig) => renderCodexAgent(agentId, currentConfig, mapModelsForTool("codex", currentConfig.models)),
      ),
      {
        path: ".agents/skills/agentflow/SKILL.md",
        tool: "codex",
        kind: "file",
        strategy: "write",
        render: (currentConfig) => renderCodexSkill(currentConfig),
      },
      {
        path: "AGENTS.md",
        tool: "codex",
        kind: "file",
        strategy: "merge-markers",
        partial: true,
        render: (currentConfig) => renderAgentsMdSection(currentConfig),
      },
    );

    if (includeExistingCodexConfig) {
      definitions.push({
        path: ".codex/config.toml",
        tool: "codex",
        kind: "file",
        strategy: "merge-codex-config",
        partial: true,
      });
    }
  }

  if (config.tools.includes("opencode")) {
    definitions.push(
      ...buildAgentDefinitions(
        "opencode",
        [
          ".opencode/agents/planner.md",
          ".opencode/agents/implementer.md",
          ".opencode/agents/tester.md",
          ".opencode/agents/documenter.md",
        ],
        (agentId, currentConfig) => renderOpenCodeAgent(agentId, currentConfig, mapModelsForTool("opencode", currentConfig.models)),
      ),
      {
        path: "opencode.json",
        tool: "opencode",
        kind: "file",
        strategy: "merge-json",
      },
    );
  }

  return definitions;
}

export async function planGeneration(
  cwd: string,
  config: AgentflowConfig,
  options: GenerationOptions = {},
): Promise<PlannedGeneration[]> {
  const includeExistingCodexConfig = await exists(path.join(cwd, ".codex/config.toml"));
  const definitions = getDefinitions(config, includeExistingCodexConfig);
  const plan: PlannedGeneration[] = [];

  for (const definition of definitions) {
    const absolutePath = path.join(cwd, definition.path);
    const alreadyExists = await exists(absolutePath);

    if (definition.kind === "directory") {
      plan.push({
        path: definition.path,
        kind: "directory",
        action: alreadyExists ? "SKIP" : "CREATE",
        strategy: definition.strategy,
      });
      continue;
    }

    if (definition.path === "CLAUDE.md" && alreadyExists) {
      const mode = options.claudeMdMode ?? "merge";
      plan.push(await buildPlanEntry(cwd, config, definition, alreadyExists, mode));
      continue;
    }

    if (definition.path === "AGENTS.md" && alreadyExists) {
      const mode = options.agentsMdMode ?? "merge";
      plan.push(await buildPlanEntry(cwd, config, definition, alreadyExists, mode));
      continue;
    }

    plan.push(await buildPlanEntry(cwd, config, definition, alreadyExists));
  }

  return plan;
}

async function buildPlanEntry(
  cwd: string,
  config: AgentflowConfig,
  definition: FileDefinition,
  alreadyExists: boolean,
  existingMode?: "merge" | "skip" | "overwrite",
): Promise<PlannedGeneration> {
  if (existingMode === "skip") {
    return {
      path: definition.path,
      kind: definition.kind,
      action: "SKIP",
      strategy: definition.strategy,
      partial: definition.partial,
    };
  }

  const absolutePath = path.join(cwd, definition.path);
  const existingContent = await readTextIfExists(absolutePath);
  const rendered = definition.render ? definition.render(getRenderConfigForPath(config, definition.path, existingContent)) : undefined;

  switch (definition.strategy) {
    case "merge-markers":
      return {
        path: definition.path,
        kind: definition.kind,
        action: alreadyExists ? existingMode === "overwrite" ? "OVERWRITE" : "MERGE" : "CREATE",
        strategy: definition.strategy,
        partial: definition.partial,
        content:
          existingMode === "overwrite" || !existingContent || !rendered
            ? rendered
            : mergeMarkedSection(existingContent, rendered),
      };
    case "merge-json":
      return {
        path: definition.path,
        kind: definition.kind,
        action: alreadyExists ? "MERGE" : "CREATE",
        strategy: definition.strategy,
        partial: definition.partial,
        content: mergeOpencodeJson(existingContent, renderOpenCodeAgentsConfig()),
      };
    case "merge-codex-config":
      return {
        path: definition.path,
        kind: definition.kind,
        action: alreadyExists ? "MERGE" : "CREATE",
        strategy: definition.strategy,
        partial: definition.partial,
        content: mergeCodexConfig(existingContent),
      };
    case "write":
      return {
        path: definition.path,
        kind: definition.kind,
        action: alreadyExists ? "OVERWRITE" : "CREATE",
        strategy: definition.strategy,
        partial: definition.partial,
        content: rendered,
      };
  }
}

function buildAgentDefinitions(
  tool: ToolId,
  paths: string[],
  render: (agentId: AgentId, config: AgentflowConfig) => string,
): FileDefinition[] {
  return paths.map((targetPath) => {
    const agentId = path.basename(targetPath).split(".")[0] as AgentId;

    return {
      path: targetPath,
      tool,
      kind: "file",
      strategy: "write",
      render: (config) => render(agentId, config),
    };
  });
}

export async function writeGenerationPlan(cwd: string, plan: PlannedGeneration[]): Promise<string[]> {
  const writtenPaths: string[] = [];

  for (const entry of plan) {
    if (entry.action === "SKIP") {
      continue;
    }

    const absolutePath = path.join(cwd, entry.path);

    if (entry.kind === "directory") {
      await ensureDir(absolutePath);
      continue;
    }

    if (typeof entry.content !== "string") {
      throw new Error(`Missing content for ${entry.path}.`);
    }

    await writeText(absolutePath, entry.content);
    writtenPaths.push(entry.path);
  }

  return writtenPaths;
}

export function buildManagedFiles(config: AgentflowConfig, writtenPaths: string[]): Record<string, string> {
  return buildManagedFilesMap(
    config,
    writtenPaths.filter((targetPath) => targetPath !== ".codex/config.toml"),
  );
}

export function getDefinitionByPath(config: AgentflowConfig, targetPath: string, includeExistingCodexConfig = false): FileDefinition | undefined {
  return getDefinitions(config, includeExistingCodexConfig).find((definition) => definition.path === targetPath);
}

export async function renderManagedFile(
  cwd: string,
  config: AgentflowConfig,
  targetPath: string,
  mode: "merge" | "overwrite" = "merge",
): Promise<string | null> {
  const includeExistingCodexConfig = targetPath === ".codex/config.toml" || (await exists(path.join(cwd, ".codex/config.toml")));
  const definition = getDefinitionByPath(config, targetPath, includeExistingCodexConfig);
  if (!definition || definition.kind !== "file") {
    return null;
  }

  const existingContent = await readTextIfExists(path.join(cwd, targetPath));

  if (definition.strategy === "merge-json") {
    return mergeOpencodeJson(existingContent, renderOpenCodeAgentsConfig());
  }

  if (definition.strategy === "merge-codex-config") {
    return mergeCodexConfig(existingContent);
  }

  if (!definition.render) {
    return null;
  }

  const renderConfig = getRenderConfigForPath(config, targetPath, existingContent);
  const rendered = definition.render(renderConfig);

  if (definition.strategy === "merge-markers" && existingContent && mode === "merge") {
    return mergeMarkedSection(existingContent, rendered);
  }

  return rendered;
}

function getRenderConfigForPath(
  config: AgentflowConfig,
  targetPath: string,
  existingContent: string | null,
): AgentflowConfig {
  const agentId = extractAgentIdFromPath(targetPath);
  const preservedModel = existingContent ? extractModelFromFile(existingContent) : undefined;

  if (!agentId || !preservedModel) {
    return config;
  }

  return {
    ...config,
    models: {
      ...config.models,
      [agentId]: preservedModel,
    },
  };
}

function extractAgentIdFromPath(targetPath: string): AgentId | null {
  const basename = path.basename(targetPath).split(".")[0];
  return basename === "planner" || basename === "implementer" || basename === "tester" || basename === "documenter"
    ? basename
    : null;
}

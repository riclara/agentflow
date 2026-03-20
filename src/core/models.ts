import type { AgentflowModels, ToolId } from "./schema.js";

export interface ModelMappingNotice {
  agent: string;
  selected: string;
  mapped: string;
}

const CLAUDE_SHORT_NAMES = new Set(["opus", "sonnet", "haiku"]);

const CODEX_MODEL_MAP: Record<string, string> = {
  opus: "gpt-5-codex",
  sonnet: "gpt-5.4-mini",
  haiku: "gpt-5.4-mini",
  "gpt-5": "gpt-5-codex",
  "gpt-mini": "gpt-5.4-mini",
};

const OPENCODE_MODEL_MAP: Record<string, string> = {
  opus: "anthropic/claude-opus-4-20250514",
  sonnet: "anthropic/claude-sonnet-4-20250514",
  haiku: "anthropic/claude-haiku-4-5-20251001",
  "gpt-5": "openai/gpt-5-codex",
  "gpt-mini": "openai/gpt-5.4-mini",
};

export function mapModelForTool(tool: ToolId, model: string): string {
  switch (tool) {
    case "claude-code":
      return CLAUDE_SHORT_NAMES.has(model) ? model : model;
    case "codex":
      return CODEX_MODEL_MAP[model] ?? model;
    case "opencode":
      return OPENCODE_MODEL_MAP[model] ?? model;
  }
}

export function mapModelsForTool(tool: ToolId, models: AgentflowModels): AgentflowModels {
  return {
    planner: mapModelForTool(tool, models.planner),
    implementer: mapModelForTool(tool, models.implementer),
    tester: mapModelForTool(tool, models.tester),
    documenter: mapModelForTool(tool, models.documenter),
  };
}

export function getCodexModelNotices(models: AgentflowModels): ModelMappingNotice[] {
  return Object.entries(models)
    .map(([agent, selected]) => ({
      agent,
      selected,
      mapped: mapModelForTool("codex", selected),
    }))
    .filter((item) => item.selected !== item.mapped);
}

export function summarizeCodexMappings(models: AgentflowModels): string[] {
  const notices = getCodexModelNotices(models);
  const unique = new Map<string, string>();

  for (const notice of notices) {
    unique.set(notice.selected, notice.mapped);
  }

  return [...unique.entries()].map(([selected, mapped]) => `"${selected}" → "${mapped}"`);
}

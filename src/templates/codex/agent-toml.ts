import type { AgentflowConfig, AgentId, AgentflowModels } from "../../core/schema.js";
import { renderDocumenterPrompt } from "../prompts/documenter.js";
import { renderImplementerPrompt } from "../prompts/implementer.js";
import { renderPlannerPrompt } from "../prompts/planner.js";
import { renderTesterPrompt } from "../prompts/tester.js";

interface CodexAgentTemplate {
  name: string;
  description: string;
  reasoningEffort: "high" | "medium" | "low";
  sandboxMode: "read-only" | "workspace-write";
  body: string;
}

export function renderCodexAgent(
  agentId: AgentId,
  config: AgentflowConfig,
  models: AgentflowModels,
): string {
  const template = getCodexTemplate(agentId, config);

  return `# .codex/agents/${agentId}.toml
# agentflow:v${config.version}

name = "${template.name}"
description = "${template.description}"
model = "${models[agentId]}"
model_reasoning_effort = "${template.reasoningEffort}"
sandbox_mode = "${template.sandboxMode}"

developer_instructions = """
${template.body}
"""
`;
}

function getCodexTemplate(agentId: AgentId, config: AgentflowConfig): CodexAgentTemplate {
  switch (agentId) {
    case "planner":
      return {
        name: "planner",
        description: "Senior software architect that creates plans and reviews code. Only writes to docs/features/.",
        reasoningEffort: "high",
        sandboxMode: "workspace-write",
        body: renderPlannerPrompt(config, "codex"),
      };
    case "implementer":
      return {
        name: "implementer",
        description: "Software developer that executes implementation tasks from plans",
        reasoningEffort: "medium",
        sandboxMode: "workspace-write",
        body: renderImplementerPrompt(config, "codex"),
      };
    case "tester":
      return {
        name: "tester",
        description: "QA engineer that writes and runs tests",
        reasoningEffort: "medium",
        sandboxMode: "workspace-write",
        body: renderTesterPrompt(config, "codex"),
      };
    case "documenter":
      return {
        name: "documenter",
        description: "Technical writer that documents tested and approved code",
        reasoningEffort: "low",
        sandboxMode: "workspace-write",
        body: renderDocumenterPrompt(config, "codex"),
      };
  }
}

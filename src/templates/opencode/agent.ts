import type { AgentflowConfig, AgentId, AgentflowModels } from "../../core/schema.js";
import { renderDocumenterPrompt } from "../prompts/documenter.js";
import { renderImplementerPrompt } from "../prompts/implementer.js";
import { renderPlannerPrompt } from "../prompts/planner.js";
import { renderTesterPrompt } from "../prompts/tester.js";

interface OpenCodeAgentTemplate {
  description: string;
  temperature: number;
  mode: "primary" | "subagent";
  toolsBlock?: string;
  body: string;
}

export function renderOpenCodeAgent(
  agentId: AgentId,
  config: AgentflowConfig,
  models: AgentflowModels,
): string {
  const template = getOpenCodeTemplate(agentId, config);

  return `---
name: ${agentId}
description: ${template.description}
model: ${models[agentId]}
temperature: ${template.temperature}
mode: ${template.mode}
${template.toolsBlock ?? ""}---
<!-- agentflow:v${config.version} -->

${template.body}
`;
}

function getOpenCodeTemplate(agentId: AgentId, config: AgentflowConfig): OpenCodeAgentTemplate {
  switch (agentId) {
    case "planner":
      return {
        description: "Analyzes requirements, plans architecture, reviews code. Only writes to docs/features/.",
        temperature: 0.2,
        mode: "primary",
        toolsBlock: `tools:
  write: true
  edit: false
  bash: false
`,
        body: renderPlannerPrompt(config, "opencode"),
      };
    case "implementer":
      return {
        description: "Implements code from the feature plan path. Fixes issues from the feature review path.",
        temperature: 0.3,
        mode: "subagent",
        body: renderImplementerPrompt(config, "opencode"),
      };
    case "tester":
      return {
        description: "Writes and runs tests. Never modifies implementation or docs.",
        temperature: 0.2,
        mode: "subagent",
        body: renderTesterPrompt(config, "opencode"),
      };
    case "documenter":
      return {
        description: "Writes project documentation. Only runs after tests pass.",
        temperature: 0.2,
        mode: "subagent",
        body: renderDocumenterPrompt(config, "opencode"),
      };
  }
}

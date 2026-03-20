import type { AgentflowConfig, AgentflowModels, AgentId } from "../../core/schema.js";
import { renderDocumenterPrompt } from "../prompts/documenter.js";
import { renderImplementerPrompt } from "../prompts/implementer.js";
import { renderPlannerPrompt } from "../prompts/planner.js";
import { renderTesterPrompt } from "../prompts/tester.js";

interface ClaudeAgentTemplate {
  description: string;
  tools: string[];
  body: string;
}

export function renderClaudeAgent(
  agentId: AgentId,
  config: AgentflowConfig,
  models: AgentflowModels = config.models,
): string {
  const template = getClaudeAgentTemplate(agentId, config);

  return `---
name: ${agentId}
description: >
  ${template.description}
tools: ${template.tools.join(", ")}
model: ${models[agentId]}
---
<!-- agentflow:v${config.version} -->

${template.body}
`;
}

function getClaudeAgentTemplate(agentId: AgentId, config: AgentflowConfig): ClaudeAgentTemplate {
  switch (agentId) {
    case "planner":
      return {
        description:
          "Analyzes requirements, creates implementation plans, and reviews code. Only writes to docs/features/ — never writes implementation code.",
        tools: ["Read", "Write", "Glob", "Grep"],
        body: renderPlannerPrompt(config),
      };
    case "implementer":
      return {
        description: "Writes code following the feature plan path. Fixes issues from the feature review path.",
        tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
        body: renderImplementerPrompt(config),
      };
    case "tester":
      return {
        description: "Writes and runs tests. Never modifies implementation code. Never writes docs.",
        tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
        body: renderTesterPrompt(config),
      };
    case "documenter":
      return {
        description: "Writes project documentation: README, API docs, setup guides. Only runs after tests pass. Never modifies implementation or test code.",
        tools: ["Read", "Write", "Edit", "Glob", "Grep"],
        body: renderDocumenterPrompt(config),
      };
  }
}

import type { AgentflowConfig } from "../../core/schema.js";
import { END_MARKER, START_MARKER } from "../../core/merger.js";

export function renderAgentsMdSection(config: AgentflowConfig): string {
  return `${START_MARKER}
# Multi-Agent Development Workflow

## Automatic
$agentflow <describe your feature>

## Manual
Ask Codex to spawn each agent by name:
1. "Spawn the planner agent to plan: <feature>"
2. "Spawn the implementer agent to implement docs/features/<slug>/plan.md"
3. "Spawn the planner agent to review against docs/features/<slug>/plan.md"
4. "Spawn the tester agent to write and run tests"
5. "Spawn the documenter agent to write documentation"

## Custom Agents
This project defines 4 custom agents in .codex/agents/:
- planner (${config.models.planner}) - plans and reviews, writes only docs/features/
- implementer (${config.models.implementer}) - writes code, full access
- tester (${config.models.tester}) - writes and runs tests, full access
- documenter (${config.models.documenter}) - writes docs, full access

## Project Context
- Language: ${config.project.language}
- Framework: ${config.project.framework}
- Tests: ${config.project.testRunner}
${END_MARKER}
`;
}

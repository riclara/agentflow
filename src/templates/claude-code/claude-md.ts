import type { AgentflowConfig } from "../../core/schema.js";
import { END_MARKER, START_MARKER } from "../../core/merger.js";

export function renderClaudeWorkflowSection(config: AgentflowConfig): string {
  return `${START_MARKER}
## Multi-Agent Workflow

### Automatic
/agentflow <describe your feature>

### Manual
1. @agent-planner plan: <feature>
2. @agent-implementer implement docs/features/<slug>/plan.md
3. @agent-planner review against docs/features/<slug>/plan.md
4. @agent-tester write and run tests
5. @agent-documenter write documentation

### Models
| Agent | Model | Role |
|-------|-------|------|
| planner | ${config.models.planner} | Plans + reviews |
| implementer | ${config.models.implementer} | Writes code |
| tester | ${config.models.tester} | Writes + runs tests |
| documenter | ${config.models.documenter} | Writes docs |

### Project
- Language: ${config.project.language}
- Framework: ${config.project.framework}
- Tests: ${config.project.testRunner}
${END_MARKER}
`;
}

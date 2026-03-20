export function renderOpenCodeAgentsConfig(): Record<string, string> {
  return {
    planner: ".opencode/agents/planner.md",
    implementer: ".opencode/agents/implementer.md",
    tester: ".opencode/agents/tester.md",
    documenter: ".opencode/agents/documenter.md",
  };
}

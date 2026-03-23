export function renderOpenCodeAgentsConfig(): Record<string, { path: string }> {
  return {
    planner: { path: ".opencode/agents/planner.md" },
    implementer: { path: ".opencode/agents/implementer.md" },
    tester: { path: ".opencode/agents/tester.md" },
    documenter: { path: ".opencode/agents/documenter.md" },
  };
}

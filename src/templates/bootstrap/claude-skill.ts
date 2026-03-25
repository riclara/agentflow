/**
 * Bootstrap skill template for Claude Code.
 * Minimal entrypoint — no embedded pipeline logic.
 * Tells Claude Code how to invoke agentflow for orchestration.
 */
export function renderClaudeBootstrapSkill(): string {
  return `# agentflow

agentflow is the workflow orchestrator for this project.

## Full pipeline

To plan, implement, review, test, and document a feature:

\`\`\`
agentflow run "<feature description>"
\`\`\`

## Single role

To run a specific role manually:

\`\`\`
agentflow agent run planner --task "<task>"
agentflow agent run implementer --task "<task>"
agentflow agent run tester --task "<task>"
agentflow agent run documenter --task "<task>"
\`\`\`

## Options

- \`--provider claude-code|codex|opencode\` — override provider
- \`--model <name>\` — override model
- \`--json\` — output result as JSON

Artifacts are written to \`docs/features/<slug>/\`.
`;
}

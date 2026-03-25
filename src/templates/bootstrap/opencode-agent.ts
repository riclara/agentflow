/**
 * Bootstrap agent template for OpenCode.
 * Minimal entrypoint — no embedded pipeline logic.
 */
export function renderOpencodeBootstrapAgent(): string {
  return `# agentflow

agentflow is the workflow orchestrator for this project.

## Full pipeline

\`\`\`
agentflow run "<feature description>"
\`\`\`

## Single role

\`\`\`
agentflow agent run planner --task "<task>"
agentflow agent run implementer --task "<task>"
agentflow agent run tester --task "<task>"
agentflow agent run documenter --task "<task>"
\`\`\`

## Options

- \`--provider claude-code|codex|opencode\`
- \`--model <name>\`
- \`--json\`

Artifacts are written to \`docs/features/<slug>/\`.
`;
}

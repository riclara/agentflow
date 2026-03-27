/**
 * Bootstrap agent template for OpenCode.
 * Full orchestration guide — YOU are the orchestrator.
 */
export function renderOpencodeBootstrapAgent(): string {
  return `# agentflow

When asked to implement a feature, YOU orchestrate the pipeline by calling \`agentflow agent run <role>\` for each specialist in sequence.

## Before you start

Read \`.agentflow.json\` to get:
- \`workflow.maxReviewIterations\` (default: 3)


The slug is the feature description lowercased with spaces → hyphens. Artifacts live under \`docs/features/<slug>/\`.

## Step 1 — Classify complexity

\`\`\`
agentflow agent run classifier --provider opencode --feature "<slug>" --task "Classify this feature: <description>. Write JSON result to: docs/features/<slug>/complexity.json"
\`\`\`

If the command fails (e.g. older agentflow without classifier role), self-classify:
- **small**: single file change, no new dependencies, no new endpoints
- **medium**: new endpoint or page, multiple files, some coordination needed
- **large**: cross-cutting concern, new service, schema change, or many unknowns

Based on \`complexity\` (from file or self-classification):
- **small**: Steps 2-3 only, skip review loop/tester/documenter
- **medium**: full pipeline
- **large**: full pipeline; apply \`modelOverrides\` if present

## Step 2 — Plan

\`\`\`
agentflow agent run planner --provider opencode --feature "<slug>" --task "Create a plan for: <description>. Write the plan to: docs/features/<slug>/plan.md"
\`\`\`

## Step 2b — Plan approval (medium/large only)

Read \`docs/features/<slug>/plan.md\` and present its full contents to the user.

Then ask:
> "Does this plan look good, or would you like to change anything before I start implementing?"

- If the user **approves** → proceed to Step 3.
- If the user **requests changes** → re-run the planner with their feedback:
  \`\`\`
  agentflow agent run planner --provider opencode --feature "<slug>" --task "Revise the plan at docs/features/<slug>/plan.md based on this feedback: <user feedback>"
  \`\`\`
  Repeat Step 2b until the user approves.

## Step 3 — Implement

\`\`\`
agentflow agent run implementer --provider opencode --feature "<slug>" --task "Implement the feature described in: docs/features/<slug>/plan.md"
\`\`\`

For **small** tasks, stop here.

## Step 4 — Review loop (medium/large)

Repeat up to \`maxReviewIterations\` times:

Review:
\`\`\`
agentflow agent run planner --provider opencode --feature "<slug>" --task "Review the implementation against the plan in: docs/features/<slug>/plan.md. Write your review (APPROVED or revision requests) to: docs/features/<slug>/review.md"
\`\`\`

Check \`docs/features/<slug>/review.md\`:
- Contains APPROVED → go to Step 5
- Not approved + iterations remain → fix and review again:
  \`\`\`
  agentflow agent run implementer --provider opencode --feature "<slug>" --task "Revise based on review in: docs/features/<slug>/review.md. Plan: docs/features/<slug>/plan.md"
  \`\`\`
- Max iterations without APPROVED → warn and continue

## Step 5 — Test and document

Run sequentially:

\`\`\`
agentflow agent run tester --provider opencode --feature "<slug>" --task "Write and run tests for: docs/features/<slug>/plan.md. Auto-detect the test runner from the project (package.json scripts, vitest.config.*, jest.config.*, pytest.ini, go.mod, Cargo.toml, Gemfile)."
\`\`\`

If tester fails: report failure and stop — skip the documenter.

\`\`\`
agentflow agent run documenter --provider opencode --feature "<slug>" --task "Document the feature described in: docs/features/<slug>/plan.md"
\`\`\`

## Options

- \`--provider claude-code|codex|opencode\`
- \`--model <name>\`
- \`--json\`
`;
}

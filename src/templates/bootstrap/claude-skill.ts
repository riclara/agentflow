/**
 * Bootstrap skill template for Claude Code.
 * Full orchestration guide — YOU are the orchestrator.
 */
export function renderClaudeBootstrapSkill(): string {
  return `# agentflow

When asked to implement a feature, YOU orchestrate the pipeline by calling \`agentflow agent run <role>\` for each specialist in sequence. Do not use \`agentflow run\` — that is for CI only.

## Before you start

Read \`.agentflow.json\` to get:
- \`workflow.maxReviewIterations\` (default: 3)

The **slug** for a feature is its description lowercased with spaces replaced by hyphens (e.g. "add login field" → \`add-login-field\`). All artifacts live under \`docs/features/<slug>/\`.

---

## Step 1 — Classify complexity

\`\`\`
agentflow agent run classifier --provider claude-code --feature "<slug>" --task "Classify this feature: <description>. Write JSON result to: docs/features/<slug>/complexity.json"
\`\`\`

If the command fails (e.g. older agentflow without classifier role), self-classify:
- **small**: single file change, no new dependencies, no new endpoints
- **medium**: new endpoint or page, multiple files, some coordination needed
- **large**: cross-cutting concern, new service, schema change, or many unknowns

Based on \`complexity\` (from file or self-classification):

| Complexity | Steps to run |
|---|---|
| **small** | Steps 2 and 3 only — skip review loop, tester, documenter |
| **medium** | Full pipeline |
| **large** | Full pipeline. If \`modelOverrides.planner\` is set, pass it as \`--model <value>\` to the planner |

---

## Step 2 — Plan

\`\`\`
agentflow agent run planner --provider claude-code --feature "<slug>" --task "Create a plan for: <description>. Write the plan to: docs/features/<slug>/plan.md"
\`\`\`

For **small** tasks, proceed to Step 3 then stop.

---

## Step 2b — Plan approval (medium/large only)

Read \`docs/features/<slug>/plan.md\` and present its full contents to the user.

Then ask:
> "Does this plan look good, or would you like to change anything before I start implementing?"

- If the user **approves** → proceed to Step 3.
- If the user **requests changes** → re-run the planner with their feedback:
  \`\`\`
  agentflow agent run planner --provider claude-code --feature "<slug>" --task "Revise the plan at docs/features/<slug>/plan.md based on this feedback: <user feedback>"
  \`\`\`
  Then repeat Step 2b (present the updated plan and ask again). Continue until the user approves.

---

## Step 3 — Implement

\`\`\`
agentflow agent run implementer --provider claude-code --feature "<slug>" --task "Implement the feature described in: docs/features/<slug>/plan.md"
\`\`\`

For **small** tasks, stop here. No review, no tests, no docs.

---

## Step 4 — Review loop (medium/large only)

Repeat up to \`maxReviewIterations\` times:

**4a. Review:**
\`\`\`
agentflow agent run planner --provider claude-code --feature "<slug>" --task "Review the implementation against the plan in: docs/features/<slug>/plan.md. Write your review (APPROVED or revision requests) to: docs/features/<slug>/review.md"
\`\`\`

**4b. Check result:**
- Read \`docs/features/<slug>/review.md\`
- If it contains **APPROVED** → proceed to Step 5
- If NOT approved AND iterations remain → run the implementer to fix, then review again:
  \`\`\`
  agentflow agent run implementer --provider claude-code --feature "<slug>" --task "Revise the implementation based on the review in: docs/features/<slug>/review.md. Original plan: docs/features/<slug>/plan.md"
  \`\`\`
- If max iterations reached without APPROVED → log a warning and proceed to Step 5

---

## Step 5 — Test and document

Run tester first, then documenter. Use Bash for both — do **not** use the Task tool here.

**Tester:**
\`\`\`
agentflow agent run tester --provider claude-code --feature "<slug>" --task "Write and run tests for the feature described in: docs/features/<slug>/plan.md. Auto-detect the test runner from the project (package.json scripts, vitest.config.*, jest.config.*, pytest.ini, go.mod, Cargo.toml, Gemfile)."
\`\`\`

If tester **failed**: report the failure and stop — skip the documenter.

**Documenter:**
\`\`\`
agentflow agent run documenter --provider claude-code --feature "<slug>" --task "Document the feature described in: docs/features/<slug>/plan.md"
\`\`\`

---

## Options

All \`agentflow agent run\` commands support:
- \`--provider claude-code|codex|opencode\` — override provider for that step
- \`--model <name>\` — override model for that step
- \`--json\` — output result as JSON

---

## Artifacts

| File | Written by |
|---|---|
| \`docs/features/<slug>/complexity.json\` | classifier |
| \`docs/features/<slug>/plan.md\` | planner |
| \`docs/features/<slug>/review.md\` | planner (review), tester (failures) |
| \`docs/features/<slug>/activity.log\` | pipeline |
`;
}

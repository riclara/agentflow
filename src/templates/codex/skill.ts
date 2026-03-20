import type { AgentflowConfig } from "../../core/schema.js";

export function renderCodexSkill(config: AgentflowConfig): string {
  return `---
name: agentflow
description: >
  Full multi-agent development pipeline. Plans architecture, implements code,
  reviews with feedback loop, writes tests and documentation.
---
<!-- agentflow:v${config.version} -->

# Build Feature Pipeline

Execute this pipeline for the requested feature using named subagents.

## Setup

Derive a filesystem-safe slug from the feature description:
- Lowercase, replace spaces and special characters with hyphens
- Example: "Add caching layer!" -> "add-caching-layer"

Set FEATURE_DIR = docs/features/<slug>
Create the directory FEATURE_DIR before starting Phase 1.

## Activity Log

Maintain FEATURE_DIR/activity.log throughout the pipeline.
After creating FEATURE_DIR, create activity.log with: "# Activity Log - [feature slug]\\n"

Before each phase, append:
## Phase N: [Name]
- Agent: @agent-[name]
- Task: [the task given to the agent]

After each phase completes, append:
- Files created/modified: [list]
- Result: [summary — e.g., "Plan created with N tasks", "APPROVED (9/10)", "5/5 tests passed"]

## Rate Limit Handling

If any agent call fails with a rate limit, 429, quota, or overloaded error:
- Append to FEATURE_DIR/activity.log:
  - Result: PAUSED_RATE_LIMIT at Phase [N] iteration [N]: [error summary]
  - Resume from Phase [N] iteration [N]
- Stop immediately
- Report to the user: "Pipeline paused due to rate limit. Resume from Phase [N] iteration [N] after capacity returns."
- Do NOT auto-retry inside the same run

## Phase 1: Plan
Spawn the planner agent to analyze the requirement.
Have it write the implementation plan to FEATURE_DIR/plan.md.
The plan must include ## Implementation Tasks, ## Test Tasks, ## Test Files, and ## Acceptance Criteria.

After it completes, read FEATURE_DIR/plan.md.
Append to FEATURE_DIR/activity.log:
- Files created/modified: FEATURE_DIR/plan.md
- Result: Plan created with [N] implementation tasks, [N] test tasks, and a ## Test Files section.

## Phase 1b: Plan Approval

Present the plan summary to the user. Show the key decisions and files to be created.

Ask the user to confirm before proceeding.

If the user approves, continue to Phase 2.
If the user requests changes, spawn the planner agent again with the feedback.
If the user rejects, stop the pipeline.

## Phase 2: Implement
Spawn the implementer agent to execute only ## Implementation Tasks from FEATURE_DIR/plan.md.
Tell it to ignore ## Test Tasks because the tester owns them.
Have it mark each completed implementation task with [x].

After it completes, verify source files were created.
Append to FEATURE_DIR/activity.log:
- Files created/modified: [implementation files list]
- Result: [N] files created/modified.

## Phase 3: Review Loop
Max iterations: ${config.workflow.maxReviewIterations}.

For each iteration:
1. Spawn the planner agent to review implementation against FEATURE_DIR/plan.md.
   Tell it to review only ## Implementation Tasks and ## Acceptance Criteria for this phase.
   Tell it not to mark ## Test Tasks as missing before testing starts.
   Have it write results to FEATURE_DIR/review.md starting with:
   ## Status: APPROVED | NEEDS_CHANGES
2. Read FEATURE_DIR/review.md.
3. Append to FEATURE_DIR/activity.log:
   - Files created/modified: FEATURE_DIR/review.md
   - Result: Review iteration [N], score [score], status [APPROVED or NEEDS_CHANGES].
4. Evaluate the review result:
   - APPROVED (score >= 80) -> proceed to Phase 4
   - NEEDS_CHANGES and iterations remaining ->
     spawn the implementer agent to fix issues in FEATURE_DIR/review.md.
     Repeat from step 1.
   - NEEDS_CHANGES and no iterations remaining ->
     stop and report remaining issues to the user.

## Phase 4: Test
Spawn the tester agent to:
- Execute only ## Test Tasks from FEATURE_DIR/plan.md
- Create test files listed in '## Test Files' section of FEATURE_DIR/plan.md
- Write tests covering acceptance criteria
- Execute tests with: ${config.project.testRunner}
- If pass: report success
- If fail: update FEATURE_DIR/review.md with:
  ## Status: NEEDS_CHANGES
  ## Test Failures

After tester completes, read FEATURE_DIR/review.md.
Append to FEATURE_DIR/activity.log:
- Files created/modified: [test files list]
- Result: [N] tests passed/failed, test files created [list].
- Still APPROVED -> proceed to Phase 5
- NEEDS_CHANGES (test failure) -> back to Phase 3

## Phase 5: Document
Spawn the documenter agent to:
- Write/update README.md with purpose, setup, usage examples
- Write API docs if applicable

After it completes, append to FEATURE_DIR/activity.log:
- Files created/modified: [documentation files list]
- Result: docs updated.

## Completion
Report: files created, review score, test results, iterations used.
Activity log: FEATURE_DIR/activity.log
`;
}

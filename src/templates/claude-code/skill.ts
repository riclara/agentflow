import type { AgentflowConfig } from "../../core/schema.js";

export function renderClaudeSkill(config: AgentflowConfig): string {
  return `---
name: agentflow
description: >
  Full multi-agent development pipeline. Plans architecture, implements code,
  reviews with feedback loop, writes tests and documentation. Use when building
  a new feature, module, or significant code change.
---
<!-- agentflow:v${config.version} -->

# Build Feature Pipeline

Execute this complete pipeline for the requested feature.

## Input
The user's feature request: $ARGUMENTS

## Setup

Derive a filesystem-safe slug from the feature description in $ARGUMENTS:
- Lowercase all characters
- Replace spaces and special characters with hyphens
- Trim leading/trailing hyphens
- Example: "Add user auth!" -> "add-user-auth"

Set FEATURE_DIR = docs/features/<slug>
Create the directory FEATURE_DIR with mkdir -p before starting Phase 1.

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

Invoke @agent-planner with this task:
"Analyze this requirement and create a detailed implementation plan.
Write the plan to FEATURE_DIR/plan.md.
The plan must include ## Implementation Tasks, ## Test Tasks, ## Test Files, and ## Acceptance Criteria.
Feature: $ARGUMENTS"

After @agent-planner completes, read FEATURE_DIR/plan.md.
Append to FEATURE_DIR/activity.log:
- Files created/modified: FEATURE_DIR/plan.md
- Result: Plan created with [N] implementation tasks, [N] test tasks, and a ## Test Files section.

## Phase 1b: Plan Approval

Present the plan summary to the user. Show:
- Number of tasks
- Files to create/modify
- Key architecture decisions

Ask the user: "Proceed with implementation? (Y/n)"

IF user approves -> go to Phase 2.
IF user requests changes -> describe what to change and invoke @agent-planner again
  with the user's feedback. Repeat from Phase 1.
IF user rejects -> STOP. Report: "Pipeline cancelled by user."

## Phase 2: Implement

Invoke @agent-implementer with this task:
"Read FEATURE_DIR/plan.md and execute only ## Implementation Tasks.
Ignore ## Test Tasks because the tester owns them.
Mark each completed implementation task with [x].
Verify code compiles/parses before finishing."

After completion, verify source files were created.
Append to FEATURE_DIR/activity.log:
- Files created/modified: [implementation files list]
- Result: [N] files created/modified.

## Phase 3: Review Loop

Set iteration = 1. Max iterations: ${config.workflow.maxReviewIterations}.

### 3a. Review
Invoke @agent-planner with:
"Review the implementation against FEATURE_DIR/plan.md.
Check only ## Implementation Tasks and ## Acceptance Criteria for this phase.
Do not mark ## Test Tasks as missing before testing starts.
Check code quality, error handling, and security.
Write results to FEATURE_DIR/review.md starting with:
## Status: APPROVED | NEEDS_CHANGES"

### 3b. Evaluate
Read FEATURE_DIR/review.md.
Append to FEATURE_DIR/activity.log:
- Files created/modified: FEATURE_DIR/review.md
- Result: Review iteration [N], score [score], status [APPROVED or NEEDS_CHANGES].

IF status = APPROVED -> go to Phase 4.

IF status = NEEDS_CHANGES AND iteration < ${config.workflow.maxReviewIterations}:
  Invoke @agent-implementer with:
  "Fix the issues in FEATURE_DIR/review.md. Append fixes to the file."
  Increment iteration. Repeat from 3a.

IF iteration = ${config.workflow.maxReviewIterations} AND still NEEDS_CHANGES:
  STOP. Report to user:
  "Pipeline paused after ${config.workflow.maxReviewIterations} review iterations.
  Score: [score]. Remaining issues: [from review.md].
  Review FEATURE_DIR/review.md and decide how to proceed."

## Phase 4: Test

Invoke @agent-tester with:
"Read FEATURE_DIR/plan.md. Execute only ## Test Tasks.
Create the test files listed in '## Test Files'.
Write tests covering all acceptance criteria.
Run tests with: ${config.project.testRunner}.
If all pass: report success.
If any fail: update FEATURE_DIR/review.md with:
## Status: NEEDS_CHANGES
## Test Failures"

### 4b. Evaluate Tests
Read FEATURE_DIR/review.md.
Append to FEATURE_DIR/activity.log:
- Files created/modified: [test files list]
- Result: [N] tests passed/failed, test files created [list].

IF status still APPROVED -> go to Phase 5.
IF status changed to NEEDS_CHANGES -> go back to Phase 3 (new iteration).

## Phase 5: Document

Invoke @agent-documenter with:
"Read the implementation and FEATURE_DIR/plan.md.
Write/update README.md with purpose, setup, usage examples, and configuration.
Write API docs if applicable."

After @agent-documenter completes, the feature is done.
Append to FEATURE_DIR/activity.log:
- Files created/modified: [documentation files list]
- Result: docs updated.

## Completion Report
- Feature: [from plan.md summary]
- Files: [list created/modified]
- Review score: [final]
- Tests: [pass/fail count]
- Iterations used: [n of max]
- Activity log: FEATURE_DIR/activity.log
`;
}

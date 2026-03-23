# agentflow — Technical Specification v1.4

## Overview

`agentflow` is a Node.js CLI tool that configures a multi-agent development
workflow in any project. It generates configuration files for 5 coding tools:
Claude Code, Cowork, Codex CLI, Codex App, and OpenCode.

The workflow uses 4 specialized subagents orchestrated by a Skill.
The subagents are simple executors; **all pipeline intelligence lives in
the orchestrating Skill**. Each subagent runs on a different model to
optimize cost vs quality.

```
Skill /agentflow (orchestrator logic)
  ├── spawns planner     (expensive model) → docs/features/<slug>/plan.md
  ├── spawns implementer (cheap model)     → source files
  ├── spawns planner     (expensive model) → docs/features/<slug>/review.md
  │   └── loop: spawns implementer for fixes (max 3x)
  ├── spawns tester      (cheap model)     → test results
  │   └── loop: back to review on test failure
  └── spawns documenter  (cheapest model)  → README + docs
      └── only runs after tests pass
```

### Key Architecture Decisions

1. **Subagents can't spawn other subagents** (Claude Code limitation).
   The main thread acts as orchestrator via the Skill. Codex has the same
   constraint: max_depth defaults to 1.

2. **All 5 tools support per-subagent model selection:**
   - Claude Code/Cowork: `model:` field in YAML frontmatter (`.claude/agents/*.md`)
   - Codex CLI/App: `model =` field in TOML files (`.codex/agents/*.toml`)
   - OpenCode: `model:` field in YAML frontmatter (`.opencode/agents/*.md`)

3. **Two startup modes:**
   - Automatic: `/agentflow <desc>` or `$agentflow` — full pipeline
   - Manual: `@agent-planner`, `@agent-implementer` etc. — step by step

---

## Install & Usage

```bash
npm install -g agentflow

cd my-project
agentflow init          # Interactive setup
agentflow status        # Show what's configured
agentflow update        # Update prompts, keep custom settings
agentflow config        # View/edit project settings
agentflow eject         # Remove CLI management, keep files
```

---

## Commands

### `agentflow init`

Interactive setup that detects tools and generates configs.

**Flow:**

1. Detect installed tools (check PATH + existing config dirs)
2. Prompt for project context (language, framework, test runner)
3. Prompt for model preferences (orchestrator model, worker model)
4. Show file list and confirm
5. Generate files
6. Write `.agentflow.json`

**Detection logic:**

| Tool | Detection method |
|------|-----------------|
| Claude Code | `which claude` succeeds OR `.claude/` dir exists |
| Cowork | Same as Claude Code (shared config format) |
| Codex CLI | `which codex` succeeds OR `.codex/` or `AGENTS.md` exists |
| Codex App | Same as Codex CLI (shared config format) |
| OpenCode | `which opencode` succeeds OR `.opencode/` dir exists |

**Conflict handling for existing files:**

- `.agentflow.json` exists → ask: reinitialize or abort
- `CLAUDE.md` exists → ask: (m)erge workflow section / (s)kip / (o)verwrite
- `AGENTS.md` exists → same options
- `opencode.json` exists → merge agent key into existing JSON
- `.codex/config.toml` exists → merge [agents] section
- Agent files → overwrite with warning

**Merge strategy for CLAUDE.md / AGENTS.md:**

Insert workflow section between markers:
```markdown
<!-- agentflow:start -->
... generated content ...
<!-- agentflow:end -->
```

Existing content outside markers is preserved.

**Flags:**

| Flag | Description |
|------|------------|
| `--tools <list>` | Comma-separated: `claude-code,codex,opencode`. Skip detection. |
| `--all` | Generate for all 5 tools regardless of detection |
| `--yes` / `-y` | Accept all defaults, no interactive prompts |
| `--model-planner <model>` | Override planner model (default: opus) |
| `--model-implementer <model>` | Override implementer model (default: sonnet) |
| `--model-tester <model>` | Override tester model (default: sonnet) |
| `--model-documenter <model>` | Override documenter model (default: haiku) |
| `--max-iterations <n>` | Max review loop iterations (default: 3) |
| `--dry-run` | Show what would be created without writing |

**Interactive prompts (using @inquirer/prompts):**

```
? Which tools to configure? (detected: claude-code, codex)
  ◉ Claude Code + Cowork
  ◉ Codex CLI + Codex App
  ◯ OpenCode

? Project language? › TypeScript
? Framework? › Express
? Test runner command? › npx vitest run

? Planner model? › opus
? Implementer model? › sonnet
? Tester model? › sonnet
? Documenter model? › haiku

Files to create:
  CREATE  .claude/skills/agentflow/SKILL.md
  CREATE  .claude/agents/planner.md
  CREATE  .claude/agents/implementer.md
  CREATE  .claude/agents/tester.md
  CREATE  .claude/agents/documenter.md
  MERGE   CLAUDE.md (add workflow section)
  CREATE  .codex/agents/planner.toml
  CREATE  .codex/agents/implementer.toml
  CREATE  .codex/agents/tester.toml
  CREATE  .codex/agents/documenter.toml
  CREATE  .agents/skills/agentflow/SKILL.md
  MERGE   AGENTS.md (add workflow section)
  CREATE  .agentflow.json
  CREATE  docs/

? Proceed? (Y/n) › Y
```

---

### `agentflow status`

```
📊 agentflow v1.0.0

Tools:
  ✓ Claude Code + Cowork   1 skill, 4 agents (.md)
  ✓ Codex CLI + App        1 skill, 4 agents (.toml), AGENTS.md
  ✗ OpenCode               not configured

Models:
  Planner:      opus
  Implementer:  sonnet
  Tester:       sonnet
  Documenter:   haiku

Workflow:
  Max iterations:    3
  Plan granularity:  adaptive
  Test execution:    auto (loop back on failure)
  Test command:      npx vitest run

Template Health: healthy
  ✓ Claude planner: healthy (meets v3 invariants)
  ✓ Claude tester: healthy (meets v3 invariants)
  ✓ Claude skill: healthy (meets v3 invariants)
  ✓ Codex planner: healthy (meets v3 invariants)
```

---

### `agentflow update`

Updates generated files to latest version without touching user customizations.

**Logic:**
1. Read `.agentflow.json` to know which files are managed
2. Inspect template health from the generated files on disk:
   - `healthy` → file exists, is managed, and contains all v3 invariants
   - `stale` → file is managed but missing required protocol markers or instructions
   - `incompatible` → file is missing or no longer managed by `agentflow`
3. Rewrite managed files if:
   - `--force` is set, OR
   - `.agentflow.json` version is outdated, OR
   - any health check is not `healthy`
4. For each rewritten managed file:
   - Read current file
   - Extract preserved fields (model, user-added content outside markers)
   - Regenerate from latest templates
   - Re-apply preserved fields
5. Update version in `.agentflow.json`
6. Re-run health checks and fail if any managed template is still not healthy

**Flags:** `--dry-run`, `--force`

---

### `agentflow config`

```bash
agentflow config                                   # Show all
agentflow config get models.planner                # Get value
agentflow config set models.planner haiku          # Change planner model
agentflow config set models.implementer gpt-mini   # Change implementer model
agentflow config set models.tester haiku           # Change tester model
agentflow config set workflow.maxIterations 5
agentflow config set project.testRunner "pytest -v"
```

After `set`, regenerates affected files automatically.

---

### `agentflow eject`

Removes CLI management. All files remain as standalone.

1. Remove `<!-- agentflow:start/end -->` markers from CLAUDE.md and AGENTS.md
2. Remove version comments from generated files
3. Delete `.agentflow.json`

---

## Configuration File: `.agentflow.json`

```json
{
  "$schema": "https://unpkg.com/agentflow/schema.json",
  "version": "1.0.0",
  "tools": ["claude-code", "codex"],
  "models": {
    "planner": "opus",
    "implementer": "sonnet",
    "tester": "sonnet",
    "documenter": "haiku"
  },
  "workflow": {
    "maxReviewIterations": 3,
    "planGranularity": "adaptive",
    "testerExecutes": true,
    "testerAutoLoop": true
  },
  "project": {
    "language": "TypeScript",
    "framework": "Express",
    "testRunner": "npx vitest run"
  },
  "managedFiles": {
    ".claude/skills/agentflow/SKILL.md": "1.0.0",
    ".claude/agents/planner.md": "1.0.0",
    ".claude/agents/implementer.md": "1.0.0",
    ".claude/agents/tester.md": "1.0.0",
    ".claude/agents/documenter.md": "1.0.0",
    "CLAUDE.md": "partial",
    ".codex/agents/planner.toml": "1.0.0",
    ".codex/agents/implementer.toml": "1.0.0",
    ".codex/agents/tester.toml": "1.0.0",
    ".codex/agents/documenter.toml": "1.0.0",
    ".agents/skills/agentflow/SKILL.md": "1.0.0",
    "AGENTS.md": "partial"
  }
}
```

---

## Generated Files — Claude Code + Cowork

These tools share the same file structure. Cowork reads `.claude/` the same
way Claude Code does.

### `.claude/skills/agentflow/SKILL.md` (THE PIPELINE BRAIN)

Orchestrator of the entire workflow. Contains full pipeline logic.
Invoked via `/agentflow <description>` or autonomously by Claude.

```markdown
---
name: agentflow
description: >
  Full multi-agent development pipeline. Plans architecture, implements code,
  reviews with feedback loop, writes tests and documentation. Use when building
  a new feature, module, or significant code change.
---

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
The plan must include ## Summary, ## Implementation Tasks, ## Test Tasks, ## Test Files, and ## Acceptance Criteria.
Feature: $ARGUMENTS"

After @agent-planner completes, read FEATURE_DIR/plan.md.

## Phase 1b: Plan Approval

Present the plan summary to the user. Show:
- Number of tasks
- Files to create/modify
- Key architecture decisions

Ask the user: "Proceed with implementation? (Y/n)"

IF user approves → go to Phase 2.
IF user requests changes → describe what to change and invoke @agent-planner again
  with the user's feedback. Repeat from Phase 1.
IF user rejects → STOP. Report: "Pipeline cancelled by user."

## Phase 2: Implement

Invoke @agent-implementer with this task:
"Read FEATURE_DIR/plan.md and execute only ## Implementation Tasks.
Ignore ## Test Tasks because the tester owns them.
Mark each completed implementation task with [x].
Verify code compiles/parses before finishing."

After completion, verify source files were created.

## Phase 3: Review Loop

Set iteration = 1. Max iterations: {{workflow.maxReviewIterations}}.

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

IF status = APPROVED → go to Phase 4.

IF status = NEEDS_CHANGES AND iteration < {{workflow.maxReviewIterations}}:
  Invoke @agent-implementer with:
  "Fix the issues in FEATURE_DIR/review.md. Append fixes to the file."
  Increment iteration. Repeat from 3a.

IF iteration = {{workflow.maxReviewIterations}} AND still NEEDS_CHANGES:
  STOP. Report to user:
  "Pipeline paused after {{workflow.maxReviewIterations}} review iterations.
  Score: [score]. Remaining issues: [from review.md].
  Review FEATURE_DIR/review.md and decide how to proceed."

## Phase 4: Test

Invoke @agent-tester with:
"Read FEATURE_DIR/plan.md. Execute only ## Test Tasks.
Create the test files listed in '## Test Files'.
Write tests covering all acceptance criteria.
Run tests with: {{project.testRunner}}.
If all pass: report success.
If any fail: update FEATURE_DIR/review.md with:
## Status: NEEDS_CHANGES
## Test Failures"

### 4b. Evaluate Tests
Read FEATURE_DIR/review.md.

IF status still APPROVED → go to Phase 5.
IF status changed to NEEDS_CHANGES → go back to Phase 3 (new iteration).

## Phase 5: Document

Invoke @agent-documenter with:
"Read the implementation and FEATURE_DIR/plan.md.
Write/update README.md with purpose, setup, usage examples, and configuration.
Write API docs if applicable."

After @agent-documenter completes, the feature is done.

## Completion Report
- Feature: [from plan.md summary]
- Files: [list created/modified]
- Review score: [final]
- Tests: [pass/fail count]
- Iterations used: [n of max]
- Activity log: FEATURE_DIR/activity.log
```

### `.claude/agents/planner.md`

```markdown
---
name: planner
description: >
  Analyzes requirements, creates implementation plans, and reviews code.
  Only writes to docs/features/ — never writes implementation code.
tools: Read, Write, Glob, Grep
model: {{models.planner}}
---
<!-- agentflow:v{{version}} -->

You are a senior software architect. You do two jobs:

## Job 1: Create Plans
When asked to plan a feature:
1. Explore the codebase to understand patterns and conventions
2. Design the architecture
3. Write to the plan path provided in the task (for example FEATURE_DIR/plan.md)
4. The plan MUST include these sections in order:
   ## Summary
   ## Implementation Tasks
   ## Test Tasks
   ## Test Files
   ## Acceptance Criteria
5. Under ## Implementation Tasks, list only implementer-owned work
6. Under ## Test Tasks, list only tester-owned work
7. Under ## Test Files, map each source file to explicit test file paths

Evaluate complexity:
- SMALL (< 3 files): High-level. Describe WHAT, not HOW.
- LARGE (3+ files): Detailed with pseudo-code and interfaces.

## Job 2: Review Implementations
When asked to review:
1. Read every file created or modified
2. Review only against ## Implementation Tasks and ## Acceptance Criteria
3. Do NOT mark ## Test Tasks as missing before the testing phase
4. Evaluate: correctness, error handling, security, edge cases, and implementation completeness
5. Write to the review path provided in the task (for example FEATURE_DIR/review.md)
6. The review MUST start with:
   ## Status: APPROVED | NEEDS_CHANGES
   ## Summary
   ## Issues
7. Include specific issues with file paths and fix suggestions.

## Rules
- Never write implementation code
- Be specific — include file paths and fix suggestions
- Project: {{project.language}} / {{project.framework}}

## Write constraints
- You may ONLY write to FEATURE_DIR/plan.md and FEATURE_DIR/review.md
- NEVER create or modify any other file
- NEVER write implementation code, test files, or documentation
```

### `.claude/agents/implementer.md`

```markdown
---
name: implementer
description: >
  Writes code following the feature plan path. Fixes issues from the feature review path.
tools: Read, Write, Edit, Bash, Glob, Grep
model: {{models.implementer}}
---
<!-- agentflow:v{{version}} -->

You are a software developer. Execute tasks, don't plan.

## Implementing from plan:
1. Read the plan path provided in the task (for example FEATURE_DIR/plan.md)
2. Execute only the tasks listed under `## Implementation Tasks`
3. Ignore `## Test Tasks` — the tester owns them
4. Mark done only inside `## Implementation Tasks`: `- [ ]` → `- [x]`
5. Verify code parses before finishing
6. Create dirs with mkdir -p

## Fixing from review:
1. Read "Issues" in the review path provided in the task (for example FEATURE_DIR/review.md)
2. Fix every issue listed
3. Append: ## Fixes Applied

## Standards
- Complete files — no TODO, no placeholders
- Error handling on all I/O
- Follow {{project.language}} / {{project.framework}} conventions

## Rules
- Follow only the implementation work defined in the plan
- Don't add unrequested features
- Don't execute or check off `## Test Tasks`
- If ambiguous: choose and comment // NOTE: ...
```

### `.claude/agents/tester.md`

```markdown
---
name: tester
description: >
  Writes and runs tests. Never modifies implementation code. Never writes docs.
tools: Read, Write, Edit, Bash, Glob, Grep
model: {{models.tester}}
---
<!-- agentflow:v{{version}} -->

You are a QA engineer. You only write and run tests.

## Testing
1. Read the plan path provided in the task (for example FEATURE_DIR/plan.md)
2. Execute only the work listed under `## Test Tasks`
3. Find the "## Test Files" section — this lists the test files you MUST create
4. Create ONLY the test files listed in the plan
   - If no "## Test Files" section exists, fall back to one test file per source module
5. Write test files covering:
   - Every acceptance criterion
   - Happy path for each public function/endpoint
   - Edge cases and error conditions
6. Run: {{project.testRunner}}
7. If ALL pass → report success. List passing tests.
8. If ANY fail → update the review path provided in the task (for example FEATURE_DIR/review.md):
   ## Status: NEEDS_CHANGES
   ## Test Failures
   - [test name]: [failure summary]
   Do NOT fix the code. Do NOT write documentation.

## Test standards
- One test file per source module
- Descriptive names: test_create_user_with_duplicate_email_raises_conflict
- Mock external dependencies
- Use fixtures for test data

## Rules
- NEVER modify implementation code
- NEVER skip test execution
- NEVER write documentation — that's the documenter's job
- Follow `## Test Tasks` and the test file list from the plan
- do NOT create extra files
- If you identify a coverage gap not in the plan, report it but do NOT create extra files
- Report bugs, don't fix them
```

### `.claude/agents/documenter.md`

```markdown
---
name: documenter
description: >
  Writes project documentation: README, API docs, setup guides.
  Only runs after tests pass. Never modifies implementation or test code.
tools: Read, Write, Edit, Glob, Grep
model: {{models.documenter}}
---
<!-- agentflow:v{{version}} -->

You are a technical writer. You document code that has been tested and approved.

## Documentation tasks
1. Read the plan path provided in the task (for example FEATURE_DIR/plan.md) for feature summary and architecture
2. Read the implementation files to understand the API/interface
3. Write/update these files:
   - README.md: purpose, installation, usage with copy-pasteable examples, configuration
   - API docs (if applicable): endpoints, parameters, response formats, error codes
   - CHANGELOG entry (if CHANGELOG.md exists): add entry under [Unreleased]
4. All code examples must be accurate to the actual implementation
5. Keep language concise and scannable

## Rules
- NEVER modify implementation code or test files
- Only document what actually exists — don't invent features
- If README.md exists, update it — don't overwrite unrelated sections
- Project: {{project.language}} / {{project.framework}}
```

### `CLAUDE.md` (workflow section between markers)

```markdown
<!-- agentflow:start -->
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
| planner | {{models.planner}} | Plans + reviews |
| implementer | {{models.implementer}} | Writes code |
| tester | {{models.tester}} | Writes + runs tests |
| documenter | {{models.documenter}} | Writes docs |

### Project
- Language: {{project.language}}
- Framework: {{project.framework}}
- Tests: {{project.testRunner}}
<!-- agentflow:end -->
```

---

## Generated Files — Codex CLI + Codex App

Both surfaces share the same configuration files. Skills and custom agents
defined in `.codex/` and `.agents/` are available in CLI, App, and IDE Extension.

### `.codex/agents/planner.toml`

Custom agent definition with its own model. Codex spawns this as a subagent
with an isolated context window.

```toml
# .codex/agents/planner.toml
# agentflow:v{{version}}

name = "planner"
description = "Senior software architect that creates plans and reviews code. Only writes to docs/features/."
model = "{{models.planner | codex format}}"
model_reasoning_effort = "high"
sandbox_mode = "workspace-write"

developer_instructions = """
You are a senior software architect. You do two jobs:

## Job 1: Create Plans
When asked to plan a feature:
1. Explore the codebase to understand patterns and conventions
2. Design the architecture
3. Write the plan to the path provided in the task (for example FEATURE_DIR/plan.md)
4. The plan MUST include these sections:
   ## Summary
   ## Implementation Tasks
   ## Test Tasks
   ## Test Files
   ## Acceptance Criteria
5. Under ## Implementation Tasks, list only implementer-owned work
6. Under ## Test Tasks, list only tester-owned work
7. Under ## Test Files, map source files to explicit test file paths

Evaluate complexity:
- SMALL (< 3 files): High-level. Describe WHAT, not HOW.
- LARGE (3+ files): Detailed with pseudo-code and interfaces.

## Job 2: Review Implementations
When asked to review:
1. Read every file created or modified
2. Review implementation against ## Implementation Tasks and ## Acceptance Criteria
3. Do NOT mark ## Test Tasks as missing before the testing phase starts
4. Evaluate: correctness, error handling, security, edge cases, and implementation completeness
5. Write to the review path provided in the task (for example FEATURE_DIR/review.md)
6. The review MUST start with:
   ## Status: APPROVED | NEEDS_CHANGES
   ## Summary
   ## Issues
7. Include specific issues with file paths and fix suggestions.

Rules:
- Never write implementation code
- Be specific — include file paths and fix suggestions

## Write constraints
- You may ONLY write to FEATURE_DIR/plan.md and FEATURE_DIR/review.md
- NEVER create or modify any other file
- NEVER write implementation code, test files, or documentation
"""
```

### `.codex/agents/implementer.toml`

```toml
# .codex/agents/implementer.toml
# agentflow:v{{version}}

name = "implementer"
description = "Software developer that executes implementation tasks from plans"
model = "{{models.implementer | codex format}}"
model_reasoning_effort = "medium"
sandbox_mode = "workspace-write"

developer_instructions = """
You are a software developer. Execute tasks, don't plan.

Implementing from plan:
1. Read the plan path provided in the task (for example FEATURE_DIR/plan.md)
2. Execute only the tasks listed under ## Implementation Tasks
3. Ignore ## Test Tasks - the tester owns them
4. Mark done only in ## Implementation Tasks
5. Verify code parses before finishing

Fixing from review:
1. Read "Issues" in the review path provided in the task (for example FEATURE_DIR/review.md)
2. Fix every issue listed
3. Append a "Fixes Applied" section

Standards:
- Complete files — no TODO, no placeholders
- Error handling on all I/O
- Follow the plan exactly — don't add unrequested features
- Do not create test-only files unless the plan explicitly places them under ## Implementation Tasks
"""
```

### `.codex/agents/tester.toml`

```toml
# .codex/agents/tester.toml
# agentflow:v{{version}}

name = "tester"
description = "QA engineer that writes and runs tests"
model = "{{models.tester | codex format}}"
model_reasoning_effort = "medium"
sandbox_mode = "workspace-write"

developer_instructions = """
You are a QA engineer. You only write and run tests.

Testing:
1. Read the plan path provided in the task (for example FEATURE_DIR/plan.md)
2. Execute only the work listed under ## Test Tasks
3. Find "## Test Files" in the plan and create ONLY those files
4. If the plan has no test file list, fall back to one test file per source module
5. Write tests: happy paths, edge cases, error conditions
6. Run: {{project.testRunner}}
7. If ALL pass: report success
8. If ANY fail: update the review path provided in the task (for example FEATURE_DIR/review.md) with:
   ## Status: NEEDS_CHANGES
   ## Test Failures
   - [test name]: [failure summary]
   Do NOT fix the code. Do NOT write documentation.

Rules:
- NEVER modify implementation code
- NEVER skip test execution
- Follow ## Test Tasks and the test file list from plan
- do NOT create extra files
- Report bugs, don't fix them
"""
```

### `.codex/agents/documenter.toml`

```toml
# .codex/agents/documenter.toml
# agentflow:v{{version}}

name = "documenter"
description = "Technical writer that documents tested and approved code"
model = "{{models.documenter | codex format}}"
model_reasoning_effort = "low"
sandbox_mode = "workspace-write"

developer_instructions = """
You are a technical writer. Document code that has been tested and approved.

Tasks:
1. Read the plan path provided in the task (for example FEATURE_DIR/plan.md) for feature summary and architecture
2. Read implementation files to understand the API/interface
3. Write/update README.md: purpose, installation, usage examples, configuration
4. Write API docs if applicable: endpoints, parameters, responses, errors
5. Add CHANGELOG entry if CHANGELOG.md exists

Rules:
- NEVER modify implementation code or test files
- Only document what actually exists
- All code examples must be accurate and copy-pasteable
"""
```

### `.agents/skills/agentflow/SKILL.md`

Pipeline brain for Codex. Same logic as Claude Code Skill but references
Codex custom agents by name.

```markdown
---
name: agentflow
description: >
  Full multi-agent development pipeline. Plans architecture, implements code,
  reviews with feedback loop, writes tests and documentation.
---

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

## Phase 3: Review Loop
Max iterations: {{workflow.maxReviewIterations}}.

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
   - APPROVED (score >= 80) → proceed to Phase 4
   - NEEDS_CHANGES and iterations remaining →
     spawn the implementer agent to fix issues in FEATURE_DIR/review.md.
     Repeat from step 1.
   - NEEDS_CHANGES and no iterations remaining →
     stop and report remaining issues to the user.

## Phase 4: Test
Spawn the tester agent to:
- Execute only ## Test Tasks from FEATURE_DIR/plan.md
- Create test files listed in '## Test Files' section of FEATURE_DIR/plan.md
- Write tests covering acceptance criteria
- Execute tests with: {{project.testRunner}}
- If pass: report success
- If fail: update FEATURE_DIR/review.md with:
  ## Status: NEEDS_CHANGES
  ## Test Failures

After tester completes, read FEATURE_DIR/review.md:
Append to FEATURE_DIR/activity.log:
- Files created/modified: [test files list]
- Result: [N] tests passed/failed, test files created [list].
- Still APPROVED → proceed to Phase 5
- NEEDS_CHANGES (test failure) → back to Phase 3

## Phase 5: Document
Spawn the documenter agent to:
- Write/update README.md with purpose, setup, usage examples
- Write API docs if applicable

## Completion
Report: files created, review score, test results, iterations used.
Activity log: FEATURE_DIR/activity.log
```

### `AGENTS.md` (workflow section between markers)

```markdown
<!-- agentflow:start -->
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
- planner ({{models.planner}}) — plans and reviews, writes only docs/features/
- implementer ({{models.implementer}}) — writes code, full access
- tester ({{models.tester}}) — writes and runs tests, full access
- documenter ({{models.documenter}}) — writes docs, full access

## Project Context
- Language: {{project.language}}
- Framework: {{project.framework}}
- Tests: {{project.testRunner}}
<!-- agentflow:end -->
```

---

## Generated Files — OpenCode

### `.opencode/agents/planner.md`

```yaml
---
name: planner
description: Analyzes requirements, plans architecture, reviews code. Only writes to docs/features/.
model: {{models.planner | opencode format}}
temperature: 0.2
mode: primary
tools:
  write: true
  edit: false
  bash: false
---
```

Same core prompt as Claude Code planner.

### `.opencode/agents/implementer.md`

```yaml
---
name: implementer
description: Implements code from the feature plan path. Fixes issues from the feature review path.
model: {{models.implementer | opencode format}}
temperature: 0.3
mode: subagent
---
```

Same core prompt as Claude Code implementer.

### `.opencode/agents/tester.md`

```yaml
---
name: tester
description: Writes and runs tests. Never modifies implementation or docs.
model: {{models.tester | opencode format}}
temperature: 0.2
mode: subagent
---
```

Same core prompt as Claude Code tester.

### `.opencode/agents/documenter.md`

```yaml
---
name: documenter
description: Writes project documentation. Only runs after tests pass.
model: {{models.documenter | opencode format}}
temperature: 0.2
mode: subagent
---
```

Same core prompt as Claude Code documenter.

### `opencode.json`

Agent section merged into existing or created.

---

## Agent Communication Protocol

### `docs/features/<slug>/plan.md`
Written by: planner | Read by: implementer, tester, Skill

### `docs/features/<slug>/review.md`
Written by: planner (review), tester (failures) | Read by: implementer, Skill

### `docs/features/<slug>/activity.log`
Written by: Skill (orchestrator) | Read by: user (post-pipeline review)

Format documented in v1.1 (unchanged).

---

## Workflow State Machine

```
 /agentflow "Add caching"     $agentflow
 (Claude Code / Cowork)           (Codex CLI / App)
         │                                │
         └──────────┬─────────────────────┘
                    ▼
 ┌──────────────────────────────────────────┐
 │ SKILL: agentflow (main thread)           │
 │                                          │
 │  Phase 1 ─── planner ──→ features/<slug>/plan.md   │
 │       │                    features/<slug>/activity.log │
 │       │      (expensive model)           │
 │       │                                  │
 │  Phase 2 ─── implementer ──→ files      │
 │       │      (cheap model)      ▲        │
 │       │                         │        │
 │  Phase 3 ─── planner ──→ features/<slug>/review.md │
 │       │                    features/<slug>/activity.log │
 │       │      (expensive model)  │        │
 │       │         │               │        │
 │       │    NEEDS_CHANGES ───────┘        │
 │       │    (max 3 iterations)            │
 │       │                                  │
 │    APPROVED                              │
 │       │                                  │
 │  Phase 4 ─── tester ──→ test results    │
 │       │                    features/<slug>/activity.log │
 │       │      (cheap model)               │
 │       │         │                        │
 │       │    FAIL ──→ back to Phase 3      │
 │       │                                  │
 │    TESTS PASS                            │
 │       │                                  │
 │  Phase 5 ─── documenter ──→ README/docs │
 │              (cheapest model)            │
 │                                          │
 │    ✅ DONE                               │
 └──────────────────────────────────────────┘
```

---

## Model Name Mapping

The CLI accepts short names and maps to tool-specific strings:

| Short | Claude Code (.md) | Codex (.toml) | OpenCode (.md) |
|-------|-------------------|---------------|----------------|
| `opus` | `model: opus` | `model = "gpt-5-codex"` | `model: anthropic/claude-opus-4-20250514` |
| `sonnet` | `model: sonnet` | `model = "gpt-5.4-mini"` | `model: anthropic/claude-sonnet-4-20250514` |
| `haiku` | `model: haiku` | `model = "gpt-5.4-mini"` | `model: anthropic/claude-haiku-4-5-20251001` |
| `gpt-5` | — | `model = "gpt-5-codex"` | `model: openai/gpt-5-codex` |
| `gpt-mini` | — | `model = "gpt-5.4-mini"` | `model: openai/gpt-5.4-mini` |

Users can also pass full model strings directly.

**Note:** Codex uses OpenAI models natively. When the user selects "opus" or
"sonnet" and Codex is a target tool, the CLI maps to the closest OpenAI
equivalent and prints a notice:
```
ℹ Codex uses OpenAI models. Mapping "opus" → "gpt-5-codex" and "sonnet" → "gpt-5.4-mini".
  Override per agent: agentflow config set models.planner gpt-5-pro
```

---

## Project Structure (agentflow CLI)

```
agentflow/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 # CLI entry (commander.js)
│   ├── commands/
│   │   ├── init.ts
│   │   ├── status.ts
│   │   ├── update.ts
│   │   ├── config.ts
│   │   └── eject.ts
│   ├── core/
│   │   ├── detector.ts          # Tool detection
│   │   ├── generator.ts         # File generation
│   │   ├── merger.ts            # Smart merge for existing files
│   │   ├── schema.ts            # .agentflow.json validation
│   │   └── models.ts            # Model name mapping per tool
│   ├── templates/
│   │   ├── prompts/             # Core prompts (source of truth)
│   │   │   ├── planner.ts
│   │   │   ├── implementer.ts
│   │   │   ├── tester.ts
│   │   │   └── documenter.ts
│   │   ├── claude-code/
│   │   │   ├── skill.ts         # SKILL.md — pipeline brain
│   │   │   ├── agent.ts         # Agent .md with YAML frontmatter
│   │   │   └── claude-md.ts     # CLAUDE.md workflow section
│   │   ├── codex/
│   │   │   ├── skill.ts         # SKILL.md for Codex
│   │   │   ├── agent-toml.ts    # .toml agent definition
│   │   │   └── agents-md.ts     # AGENTS.md workflow section
│   │   └── opencode/
│   │       ├── agent.ts         # .md with OpenCode frontmatter
│   │       └── config-json.ts   # opencode.json agent section
│   └── utils/
│       ├── fs.ts
│       ├── logger.ts
│       └── prompts.ts           # @inquirer/prompts wrappers
├── tests/
│   ├── detector.test.ts
│   ├── generator.test.ts
│   ├── models.test.ts
│   └── commands/
│       └── init.test.ts
└── README.md
```

---

## Dependencies

```json
{
  "dependencies": {
    "commander": "^13.0.0",
    "@inquirer/prompts": "^7.0.0",
    "chalk": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0",
    "tsup": "^8.0.0"
  }
}
```

---

## Complete File Generation Matrix

What `agentflow init` generates per tool:

| File | Claude Code | Cowork | Codex CLI | Codex App | OpenCode |
|------|:-----------:|:------:|:---------:|:---------:|:--------:|
| `.claude/skills/agentflow/SKILL.md` | ✓ | ✓ | — | — | — |
| `.claude/agents/planner.md` | ✓ | ✓ | — | — | — |
| `.claude/agents/implementer.md` | ✓ | ✓ | — | — | — |
| `.claude/agents/tester.md` | ✓ | ✓ | — | — | — |
| `.claude/agents/documenter.md` | ✓ | ✓ | — | — | — |
| `CLAUDE.md` (section) | ✓ | ✓ | — | — | — |
| `.codex/agents/planner.toml` | — | — | ✓ | ✓ | — |
| `.codex/agents/implementer.toml` | — | — | ✓ | ✓ | — |
| `.codex/agents/tester.toml` | — | — | ✓ | ✓ | — |
| `.codex/agents/documenter.toml` | — | — | ✓ | ✓ | — |
| `.agents/skills/agentflow/SKILL.md` | — | — | ✓ | ✓ | — |
| `AGENTS.md` (section) | — | — | ✓ | ✓ | — |
| `.opencode/agents/planner.md` | — | — | — | — | ✓ |
| `.opencode/agents/implementer.md` | — | — | — | — | ✓ |
| `.opencode/agents/tester.md` | — | — | — | — | ✓ |
| `.opencode/agents/documenter.md` | — | — | — | — | ✓ |
| `opencode.json` (agent) | — | — | — | — | ✓ |
| `.agentflow.json` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `docs/` | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## Agent Naming

| Agent | Default model | Claude Code | Codex | OpenCode |
|-------|--------------|-------------|-------|----------|
| **planner** | opus | .md (opus) | .toml (gpt-5-codex) | .md (opus) |
| **implementer** | sonnet | .md (sonnet) | .toml (gpt-5.4-mini) | .md (sonnet) |
| **tester** | sonnet | .md (sonnet) | .toml (gpt-5.4-mini) | .md (sonnet) |
| **documenter** | haiku | .md (haiku) | .toml (gpt-5.4-mini) | .md (haiku) |

Each agent's model is independently configurable via:
- `agentflow init` interactive prompts
- `agentflow config set models.<agent> <model>`
- Direct file editing (preserved on `agentflow update`)

---

## Summary of Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | Node.js + TypeScript | npm ecosystem |
| UX | @inquirer/prompts | Interactive terminal |
| Templates | Template literals | Zero deps, type-safe |
| Config | `.agentflow.json` | Standard, IDE support |
| Communication | Files in docs/ | Universal across 5 tools |
| Pipeline brain | Skill (SKILL.md) | Subagents can't chain |
| Agents | 4: planner, implementer, tester, documenter | Separation of concerns |
| Agent role | Simple executors | Logic centralized in Skill |
| Per-agent models | 4 levels, independently configurable | Max control per role |
| Claude Code agents | .md with YAML frontmatter | Native format |
| Codex agents | .toml with model field | Native format (custom agents) |
| OpenCode agents | .md with YAML frontmatter | Native format |
| Plan granularity | Adaptive | Small = fast, large = thorough |
| Review loop | Max 3 iterations | Autonomy with guardrail |
| Test vs Docs | Separate phases (4 and 5) | Docs only run after tests pass |
| Test execution | Auto + loop-back | Failures re-enter review |
| Traceability | Activity log per feature | Visibility into agent actions per phase |
| Test scope | Plan-driven test files | Prevent uncoordinated test creation |
| Auto mode | /agentflow or $agentflow | Full 5-phase pipeline |
| Manual mode | @agent-planner etc. | Step-by-step control |
| Skill format | .claude/skills/ (new) | Recommended over legacy commands/ |
| Model mapping | Short names → tool-specific | Cross-tool convenience |
| Versioning | Markers in files | Update without losing customs |

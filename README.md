# agentflow

Language: English | [Español](README.es.md)

`agentflow` is a Node.js CLI that configures a multi-agent development workflow
for Claude Code, Cowork, Codex CLI, Codex App, and OpenCode.

It generates four specialized agents:

- planner
- implementer
- tester
- documenter

The orchestration logic lives in the generated `agentflow` skill for Claude and
Codex. OpenCode gets the agent definitions for manual execution.

## Install the CLI

Install `agentflow` globally once:

```bash
npm install -g @riclara/agentflow
```

Then, inside each project where you want the workflow:

```bash
cd my-project
```

## Commands

```bash
agentflow init
agentflow status
agentflow update
agentflow config
agentflow eject
```

## What v3 adds

- The planner is write-capable for feature artifacts and may write only `docs/features/<slug>/plan.md` and `docs/features/<slug>/review.md`.
- Plans now separate `## Implementation Tasks`, `## Test Tasks`, and `## Test Files`.
- Generated skills maintain `docs/features/<slug>/activity.log` and pause cleanly with `PAUSED_RATE_LIMIT`, including resume instructions.
- `agentflow status` reports `Template Health` (`healthy`, `stale`, or `incompatible`) from the generated files on disk, not only from `.agentflow.json`.
- `agentflow update` rewrites managed files when templates are stale or out of date, while preserving custom models and marker-merged content.

## Initialization: which command to run in each case

### Case 1: brand new project or project that never used agentflow

Run:

```bash
agentflow init
```

Use this when:

- there is no `.agentflow.json`
- you want `agentflow` to generate the agents for the first time
- you want to select tools, models, language, framework, and test runner

### Case 2: project already initialized with agentflow

Run:

```bash
agentflow status
agentflow update
agentflow status
```

Use this when:

- the project already has `.agentflow.json`
- you want to migrate old prompts/templates to the latest version
- you want to verify whether generated files are `healthy`, `stale`, or `incompatible`

This is the right flow for testing migrations. Do not re-run `init` unless you
actually want to reinitialize the project.

### Case 3: project already has Claude/Codex/OpenCode config, but not agentflow

Run:

```bash
agentflow init
```

During `init`, `agentflow` will merge into:

- `CLAUDE.md`
- `AGENTS.md`
- `opencode.json`
- `.codex/config.toml`

and generate the agent files it manages.

### Case 4: project was initialized, but `status` shows `incompatible`

Start with:

```bash
agentflow status
agentflow update
```

If `incompatible` remains, the project likely has missing or unmanaged files.
In that case, re-running `agentflow init` is the simplest recovery path.

## What `agentflow init` generates

Depending on the selected tools:

- Claude Code / Cowork:
  - `.claude/skills/agentflow/SKILL.md`
  - `.claude/agents/planner.md`
  - `.claude/agents/implementer.md`
  - `.claude/agents/tester.md`
  - `.claude/agents/documenter.md`
  - workflow section in `CLAUDE.md`
- Codex CLI / Codex App:
  - `.codex/agents/planner.toml`
  - `.codex/agents/implementer.toml`
  - `.codex/agents/tester.toml`
  - `.codex/agents/documenter.toml`
  - `.agents/skills/agentflow/SKILL.md`
  - workflow section in `AGENTS.md`
- OpenCode:
  - `.opencode/agents/planner.md`
  - `.opencode/agents/implementer.md`
  - `.opencode/agents/tester.md`
  - `.opencode/agents/documenter.md`
  - `agents` section merged into `opencode.json`

It also creates `.agentflow.json` and the base `docs/` directory.

## Daily usage

### Automatic mode

Use automatic mode when the tool supports the generated `agentflow` skill.

- Claude Code / Cowork:

```text
/agentflow <describe your feature>
```

- Codex CLI / Codex App:

```text
$agentflow <describe your feature>
```

Automatic mode runs the full pipeline:

1. planner writes `docs/features/<slug>/plan.md`
2. user approves or requests changes
3. implementer executes `## Implementation Tasks`
4. planner reviews into `docs/features/<slug>/review.md`
5. tester executes `## Test Tasks` and writes tests from `## Test Files`
6. documenter updates docs after tests pass

### Manual mode

Use manual mode when:

- you want to run one phase at a time
- you are debugging the workflow
- you are using OpenCode

#### Claude Code / Cowork

Run the agents directly:

```text
@agent-planner plan: <feature>
@agent-implementer implement docs/features/<slug>/plan.md
@agent-planner review against docs/features/<slug>/plan.md
@agent-tester write and run tests
@agent-documenter write documentation
```

#### Codex CLI / Codex App

Ask Codex to spawn the named agents:

```text
Spawn the planner agent to plan: <feature>
Spawn the implementer agent to implement docs/features/<slug>/plan.md
Spawn the planner agent to review against docs/features/<slug>/plan.md
Spawn the tester agent to write and run tests
Spawn the documenter agent to write documentation
```

#### OpenCode

OpenCode is manual-only in this repo. Use the generated agents by name:

```text
@planner
@implementer
@tester
@documenter
```

Then give each one the appropriate task for the phase you want to run.

## What to tell each agent

These are the expected task shapes when you run agents manually.

### Planner: create a plan

Use this when the feature has not been planned yet.

```text
Plan this feature and write the result to docs/features/<slug>/plan.md.
The plan must include:
- ## Summary
- ## Implementation Tasks
- ## Test Tasks
- ## Test Files
- ## Acceptance Criteria
Feature: <your feature request>
```

### Implementer: execute the plan

Use this after the plan is approved.

```text
Read docs/features/<slug>/plan.md and execute only ## Implementation Tasks.
Ignore ## Test Tasks.
Mark completed implementation tasks with [x].
```

### Planner: review the implementation

Use this after implementation or after fixes.

```text
Review the implementation against docs/features/<slug>/plan.md.
Check only ## Implementation Tasks and ## Acceptance Criteria for this phase.
Do not mark ## Test Tasks as missing before testing starts.
Write results to docs/features/<slug>/review.md starting with:
## Status: APPROVED | NEEDS_CHANGES
```

### Tester: write and run tests

Use this after the implementation passes review.

```text
Read docs/features/<slug>/plan.md.
Execute only ## Test Tasks.
Create only the files listed in ## Test Files.
Write and run tests with the configured test command.
If tests fail, update docs/features/<slug>/review.md with:
## Status: NEEDS_CHANGES
## Test Failures
```

### Documenter: update docs

Use this only after tests pass.

```text
Read docs/features/<slug>/plan.md and the final implementation.
Update README.md and any relevant docs to match the approved, tested behavior.
```

## Template Health

`agentflow status` validates the generated planner, tester, and skill files
against the workflow invariants:

- planner can write only feature artifacts
- skills use `docs/features/<slug>/` and `activity.log`
- tester follows `## Test Tasks` and `## Test Files`

If a managed file is present but missing v3 invariants, it is reported as
`stale`.

If a required file is missing or no longer managed by `agentflow`, it is
reported as `incompatible`.

## Recommended maintenance flow

Use these commands in this order:

```bash
agentflow status
agentflow update
agentflow status
```

That gives you:

- a health report before changing anything
- migration of managed files if they are stale or outdated
- a final confirmation that the project is healthy

## Repository Automation

For CI, npm publishing, and branch protection setup, see
[`docs/repository-setup.md`](docs/repository-setup.md).

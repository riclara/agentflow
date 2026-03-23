import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildManagedFiles, planGeneration, renderManagedFile, writeGenerationPlan } from "../src/core/generator.js";
import { mapModelsForTool } from "../src/core/models.js";
import { AGENTFLOW_VERSION, createConfig } from "../src/core/schema.js";
import { renderClaudeAgent } from "../src/templates/claude-code/agent.js";
import { renderClaudeSkill } from "../src/templates/claude-code/skill.js";
import { renderCodexAgent } from "../src/templates/codex/agent-toml.js";
import { renderCodexSkill } from "../src/templates/codex/skill.js";
import { renderOpenCodeAgent } from "../src/templates/opencode/agent.js";
import { renderImplementerPrompt } from "../src/templates/prompts/implementer.js";
import { renderPlannerPrompt } from "../src/templates/prompts/planner.js";
import { renderTesterPrompt } from "../src/templates/prompts/tester.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const target = await mkdtemp(path.join(os.tmpdir(), "agentflow-generator-"));
  tempDirs.push(target);
  return target;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

describe("generator", () => {
  it("plans and writes the expected files for configured tools", async () => {
    const cwd = await makeTempDir();
    const config = createConfig({
      tools: ["claude-code", "codex"],
      managedFiles: {},
    });

    const plan = await planGeneration(cwd, config);
    const paths = plan.map((entry) => `${entry.action}:${entry.path}`);

    expect(paths).toContain("CREATE:docs");
    expect(paths).toContain("CREATE:.claude/skills/agentflow/SKILL.md");
    expect(paths).toContain("CREATE:.codex/agents/planner.toml");
    expect(paths).toContain("CREATE:CLAUDE.md");
    expect(paths).toContain("CREATE:AGENTS.md");

    const writtenPaths = await writeGenerationPlan(cwd, plan);
    expect(writtenPaths).toContain(".claude/agents/planner.md");
    expect(buildManagedFiles(config, writtenPaths)).toMatchObject({
      ".claude/agents/planner.md": AGENTFLOW_VERSION,
      "CLAUDE.md": "partial",
      "AGENTS.md": "partial",
    });
  });

  it("preserves a manually edited model during managed regeneration", async () => {
    const cwd = await makeTempDir();
    const config = createConfig({
      tools: ["codex"],
      managedFiles: {},
    });

    await mkdir(path.join(cwd, ".codex/agents"), { recursive: true });
    await writeFile(
      path.join(cwd, ".codex/agents/planner.toml"),
      '# .codex/agents/planner.toml\n# agentflow:v1.0.0\n\nmodel = "gpt-5-pro"\n',
      "utf8",
    );

    const rendered = await renderManagedFile(cwd, config, ".codex/agents/planner.toml");
    expect(rendered).toContain('model = "gpt-5-pro"');
  });

  it("renders codex agents with the new flat schema", () => {
    const config = createConfig({
      tools: ["codex"],
      managedFiles: {},
    });

    const rendered = renderCodexAgent("planner", config, mapModelsForTool("codex", config.models));

    expect(rendered).toContain('name = "planner"');
    expect(rendered).toContain(
      'description = "Senior software architect that creates plans and reviews code. Only writes to docs/features/."',
    );
    expect(rendered).toContain('sandbox_mode = "workspace-write"');
    expect(rendered).toContain('developer_instructions = """');
    expect(rendered).not.toContain("[sandbox]");
    expect(rendered).not.toMatch(/^mode = "workspace-write"$/m);
    expect(rendered).not.toMatch(/^instructions = """$/m);
  });

  it("claude-code planner agent includes Write tool", () => {
    const config = createConfig({ tools: ["claude-code"], managedFiles: {} });
    const rendered = renderClaudeAgent("planner", config, config.models);

    expect(rendered).toContain("tools: Read, Write, Glob, Grep");
    expect(rendered).toContain("Only writes to docs/features/");
  });

  it("codex planner agent has workspace-write sandbox", () => {
    const config = createConfig({ tools: ["codex"], managedFiles: {} });
    const rendered = renderCodexAgent("planner", config, mapModelsForTool("codex", config.models));

    expect(rendered).toContain('sandbox_mode = "workspace-write"');
    expect(rendered).not.toContain('sandbox_mode = "read-only"');
  });

  it("planner prompt includes write constraints", () => {
    const config = createConfig({ tools: ["claude-code"], managedFiles: {} });
    const prompt = renderPlannerPrompt(config);

    expect(prompt).toContain("Write constraints");
    expect(prompt).toContain("ONLY write to FEATURE_DIR");
  });

  it("planner prompt instructs to list test files", () => {
    const config = createConfig({ tools: ["claude-code"], managedFiles: {} });
    const prompt = renderPlannerPrompt(config);

    expect(prompt).toContain("## Implementation Tasks");
    expect(prompt).toContain("## Test Tasks");
    expect(prompt).toContain("Test Files");
    expect(prompt).toContain("## Status: APPROVED | NEEDS_CHANGES");
  });

  it("tester prompt follows test file list from plan", () => {
    const config = createConfig({ tools: ["claude-code"], managedFiles: {} });
    const prompt = renderTesterPrompt(config);

    expect(prompt).toContain("## Test Tasks");
    expect(prompt).toContain("## Test Files");
    expect(prompt).toContain("do NOT create extra files");
  });

  it("implementer prompt leaves test tasks to the tester", () => {
    const config = createConfig({ tools: ["claude-code"], managedFiles: {} });
    const prompt = renderImplementerPrompt(config);

    expect(prompt).toContain("## Implementation Tasks");
    expect(prompt).toContain("Ignore `## Test Tasks`");
  });

  it("merges workflow markers into existing files", async () => {
    const cwd = await makeTempDir();
    const config = createConfig({
      tools: ["claude-code"],
      managedFiles: {},
    });

    await writeFile(path.join(cwd, "CLAUDE.md"), "# Existing header\n", "utf8");

    const plan = await planGeneration(cwd, config, { claudeMdMode: "merge" });
    await writeGenerationPlan(cwd, plan);

    const merged = await readFile(path.join(cwd, "CLAUDE.md"), "utf8");
    expect(merged).toContain("# Existing header");
    expect(merged).toContain("<!-- agentflow:start -->");
    expect(merged).toContain("/agentflow <describe your feature>");
  });

  it("claude skill template uses feature directory paths", () => {
    const config = createConfig({ tools: ["claude-code"], managedFiles: {} });
    const skill = renderClaudeSkill(config);

    expect(skill).toContain("docs/features/");
    expect(skill).toContain("FEATURE_DIR");
    expect(skill).toContain("activity.log");
    expect(skill).toContain("## Test Files");
  });

  it("claude skill template includes activity log", () => {
    const config = createConfig({ tools: ["claude-code"], managedFiles: {} });
    const skill = renderClaudeSkill(config);

    expect(skill).toContain("activity.log");
    expect(skill).toContain("Activity Log");
    expect(skill).toContain("PAUSED_RATE_LIMIT");
    expect(skill).toContain("Resume from Phase");
  });

  it("codex skill template uses feature directory paths", () => {
    const config = createConfig({ tools: ["codex"], managedFiles: {} });
    const skill = renderCodexSkill(config);

    expect(skill).toContain("docs/features/");
    expect(skill).toContain("FEATURE_DIR");
    expect(skill).toContain("activity.log");
    expect(skill).toContain("## Test Files");
  });

  it("codex skill template includes activity log", () => {
    const config = createConfig({ tools: ["codex"], managedFiles: {} });
    const skill = renderCodexSkill(config);

    expect(skill).toContain("activity.log");
    expect(skill).toContain("PAUSED_RATE_LIMIT");
    expect(skill).toContain("Resume from Phase");
  });

  it("opencode planner stays write-capable but limited to feature artifacts", () => {
    const config = createConfig({ tools: ["opencode"], managedFiles: {} });
    const rendered = renderOpenCodeAgent("planner", config, mapModelsForTool("opencode", config.models));

    expect(rendered).toContain("write: true");
    expect(rendered).toContain("edit: false");
    expect(rendered).toContain("## Implementation Tasks");
    expect(rendered).toContain("## Test Tasks");
  });
});

import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runInitCommand } from "../../src/commands/init.js";
import { readConfig } from "../../src/core/schema.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const target = await mkdtemp(path.join(os.tmpdir(), "agentflow-init-"));
  tempDirs.push(target);
  return target;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

describe("runInitCommand", () => {
  it("creates the configured project files in non-interactive mode", async () => {
    const cwd = await makeTempDir();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await runInitCommand(cwd, {
      yes: true,
      tools: "claude-code,codex",
    });

    const config = await readConfig(cwd);
    expect(config).not.toBeNull();
    expect(config?.tools).toEqual(["claude-code", "codex"]);
    expect(config?.managedFiles).toMatchObject({
      ".claude/skills/agentflow/SKILL.md": "1.0.0",
      ".codex/agents/planner.toml": "1.0.0",
      "CLAUDE.md": "partial",
      "AGENTS.md": "partial",
    });

    const claudeSkill = await readFile(path.join(cwd, ".claude/skills/agentflow/SKILL.md"), "utf8");
    const codexPlanner = await readFile(path.join(cwd, ".codex/agents/planner.toml"), "utf8");
    const agentsMd = await readFile(path.join(cwd, "AGENTS.md"), "utf8");

    expect(claudeSkill).toContain("# Build Feature Pipeline");
    expect(codexPlanner).toContain('model = "gpt-5-codex"');
    expect(agentsMd).toContain("Multi-Agent Development Workflow");
  });

  it("supports dry-run mode without writing files", async () => {
    const cwd = await makeTempDir();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await runInitCommand(cwd, {
      yes: true,
      all: true,
      dryRun: true,
    });

    expect(await readConfig(cwd)).toBeNull();
  });
});

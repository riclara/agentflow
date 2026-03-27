import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runInitCommand } from "../../src/commands/init.js";
import { runStatusCommand } from "../../src/commands/status.js";
import { runUpdateCommand } from "../../src/commands/update.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const target = await mkdtemp(path.join(os.tmpdir(), "agentflow-status-update-"));
  tempDirs.push(target);
  return target;
}

function getConsoleOutput(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.flat().join("\n");
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

describe("status + update commands", () => {
  it("status reports bootstrap files for a fresh install", async () => {
    const cwd = await makeTempDir();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runInitCommand(cwd, {
      yes: true,
      tools: "claude-code,codex",
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runStatusCommand(cwd);

    const output = getConsoleOutput(logSpy);
    expect(output).toContain("Bootstrap files:");
    expect(output).toContain(".claude/skills/agentflow/SKILL.md");
    expect(output).toContain(".agents/skills/agentflow/SKILL.md");
  });

  it("status detects legacy role files left from previous versions", async () => {
    const cwd = await makeTempDir();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runInitCommand(cwd, {
      yes: true,
      tools: "claude-code",
    });

    // Simulate a legacy file left over from a previous install
    const agentsDir = path.join(cwd, ".claude", "agents");
    await mkdir(agentsDir, { recursive: true });
    await writeFile(
      path.join(agentsDir, "planner.md"),
      `---
name: planner
description: legacy planner
---
legacy content
`,
      "utf8",
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runStatusCommand(cwd);

    const output = getConsoleOutput(logSpy);
    expect(output).toContain(".claude/agents/planner.md");
  });

  it("update rewrites bootstrap files when config version is outdated", async () => {
    const cwd = await makeTempDir();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runInitCommand(cwd, {
      yes: true,
      tools: "claude-code",
    });

    // Corrupt the SKILL.md so we can detect it was rewritten
    const skillPath = path.join(cwd, ".claude", "skills", "agentflow", "SKILL.md");
    await writeFile(skillPath, "outdated content", "utf8");

    // Force update to trigger rewrite
    await runUpdateCommand(cwd, { force: true });

    const skill = await readFile(skillPath, "utf8");
    expect(skill).not.toBe("outdated content");
    expect(skill).toContain("agentflow");
  });

  it("update --force rewrites healthy managed files", async () => {
    const cwd = await makeTempDir();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runInitCommand(cwd, {
      yes: true,
      tools: "claude-code",
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runUpdateCommand(cwd, { force: true });

    const output = getConsoleOutput(logSpy);
    expect(output).toContain(".claude/skills/agentflow/SKILL.md");
  });
});

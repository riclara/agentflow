import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  it("status reports healthy template health for a fresh install", async () => {
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
    expect(output).toContain("Template Health: healthy");
    expect(output).toContain("Claude planner: healthy");
    expect(output).toContain("Codex skill: healthy");
  });

  it("status reports stale templates when v3 invariants are missing", async () => {
    const cwd = await makeTempDir();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runInitCommand(cwd, {
      yes: true,
      tools: "claude-code",
    });

    await writeFile(
      path.join(cwd, ".claude/agents/planner.md"),
      `---
name: planner
description: broken planner
tools: Read, Write, Glob, Grep
model: opus
---
broken
`,
      "utf8",
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runStatusCommand(cwd);

    const output = getConsoleOutput(logSpy);
    expect(output).toContain("Template Health: stale");
    expect(output).toContain("Claude planner: stale");
  });

  it("update rewrites managed files when template health is stale even at the current version", async () => {
    const cwd = await makeTempDir();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runInitCommand(cwd, {
      yes: true,
      tools: "claude-code",
    });

    const plannerPath = path.join(cwd, ".claude/agents/planner.md");
    await writeFile(
      plannerPath,
      `---
name: planner
description: stale planner
tools: Read, Write, Glob, Grep
model: opus
---
stale
`,
      "utf8",
    );

    await runUpdateCommand(cwd, {});

    const planner = await readFile(plannerPath, "utf8");
    expect(planner).toContain("## Implementation Tasks");
    expect(planner).toContain("## Test Tasks");
    expect(planner).toContain("## Status: APPROVED | NEEDS_CHANGES");
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
    expect(output).toContain(".claude/agents/planner.md");
    expect(output).toContain(".claude/skills/agentflow/SKILL.md");
  });
});

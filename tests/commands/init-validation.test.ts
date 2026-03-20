import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const target = await mkdtemp(path.join(os.tmpdir(), "agentflow-init-validation-"));
  tempDirs.push(target);
  return target;
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("../../src/core/health.js");
  await Promise.all(tempDirs.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

describe("runInitCommand validation", () => {
  it("fails if post-generation validation detects broken templates", async () => {
    const cwd = await makeTempDir();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    vi.doMock("../../src/core/health.js", () => ({
      collectTemplateHealth: vi.fn(async () => ({
        status: "stale",
        checks: [
          {
            key: "claude-planner",
            label: "Claude planner",
            path: ".claude/agents/planner.md",
            tool: "claude-code",
            status: "stale",
            reason: "missing Implementation Tasks section",
            managed: true,
            missingRequirements: ["Implementation Tasks section"],
          },
        ],
      })),
    }));

    const { runInitCommand } = await import("../../src/commands/init.js");

    await expect(
      runInitCommand(cwd, {
        yes: true,
        tools: "claude-code",
      }),
    ).rejects.toThrow("Generated templates failed post-generation validation");
  });
});

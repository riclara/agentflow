import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runInitCommand } from "../../src/commands/init.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const target = await mkdtemp(path.join(os.tmpdir(), "agentflow-init-validation-"));
  tempDirs.push(target);
  return target;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

describe("runInitCommand validation", () => {
  it("fails if --max-iterations is less than 1", async () => {
    const cwd = await makeTempDir();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      runInitCommand(cwd, {
        yes: true,
        tools: "claude-code",
        maxIterations: "0",
      }),
    ).rejects.toThrow("--max-iterations must be an integer >= 1.");
  });
});

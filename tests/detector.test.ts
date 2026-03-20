import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { detectTools, parseToolList } from "../src/core/detector.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const target = await mkdtemp(path.join(os.tmpdir(), "agentflow-detector-"));
  tempDirs.push(target);
  return target;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

describe("detectTools", () => {
  it("detects grouped tools from existing config directories", async () => {
    const cwd = await makeTempDir();
    await mkdir(path.join(cwd, ".claude"), { recursive: true });
    await mkdir(path.join(cwd, ".opencode"), { recursive: true });
    await writeFile(path.join(cwd, "AGENTS.md"), "# Existing agents\n", "utf8");

    const detection = await detectTools(cwd);

    expect(detection.detectedGroups).toEqual(["claude-code", "codex", "opencode"]);
    expect(detection.claudeCode).toBe(true);
    expect(detection.codexCli).toBe(true);
    expect(detection.opencode).toBe(true);
  });

  it("parses tool lists with supported synonyms", () => {
    expect(parseToolList("cowork,codex-app,opencode")).toEqual(["claude-code", "codex", "opencode"]);
  });
});

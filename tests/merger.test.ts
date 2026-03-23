import { describe, expect, it } from "vitest";

import { mergeOpencodeJson } from "../src/core/merger.js";

describe("mergeOpencodeJson", () => {
  const agentsSection = {
    planner: { path: ".opencode/agents/planner.md" },
    implementer: { path: ".opencode/agents/implementer.md" },
    tester: { path: ".opencode/agents/tester.md" },
    documenter: { path: ".opencode/agents/documenter.md" },
  };

  it("creates a fresh opencode.json with the correct agent key", () => {
    const result = JSON.parse(mergeOpencodeJson(null, agentsSection));

    expect(result).toHaveProperty("agent");
    expect(result.agent.planner).toEqual({ path: ".opencode/agents/planner.md" });
    expect(result).not.toHaveProperty("agents");
  });

  it("merges into an existing file that has no agent key", () => {
    const existing = JSON.stringify({ $schema: "https://opencode.ai/config.json" });
    const result = JSON.parse(mergeOpencodeJson(existing, agentsSection));

    expect(result).toHaveProperty("$schema");
    expect(result).toHaveProperty("agent");
    expect(result).not.toHaveProperty("agents");
  });

  it("removes stale 'agents' key when migrating from the old buggy format", () => {
    const existing = JSON.stringify({
      agents: { planner: ".opencode/agents/planner.md" },
    });
    const result = JSON.parse(mergeOpencodeJson(existing, agentsSection));

    expect(result).toHaveProperty("agent");
    expect(result.agent.planner).toEqual({ path: ".opencode/agents/planner.md" });
    expect(result).not.toHaveProperty("agents");
  });

  it("preserves existing agent entries not in the new section", () => {
    const existing = JSON.stringify({
      agent: { custom: { path: ".opencode/agents/custom.md" } },
    });
    const result = JSON.parse(mergeOpencodeJson(existing, agentsSection));

    expect(result.agent.custom).toEqual({ path: ".opencode/agents/custom.md" });
    expect(result.agent.planner).toEqual({ path: ".opencode/agents/planner.md" });
  });

  it("handles empty string as null", () => {
    const result = JSON.parse(mergeOpencodeJson("", agentsSection));

    expect(result).toHaveProperty("agent");
    expect(result).not.toHaveProperty("agents");
  });
});

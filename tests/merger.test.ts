import { describe, expect, it } from "vitest";

import { mergeCodexConfig, mergeOpencodeJson } from "../src/core/merger.js";

const EXPECTED_AGENT_BLOCKS =
  `[agents.planner]\ndescription = "Senior software architect that creates plans and reviews code. Only writes to docs/features/."\nconfig_file = ".codex/agents/planner.toml"\n\n` +
  `[agents.implementer]\ndescription = "Software developer that executes implementation tasks from plans"\nconfig_file = ".codex/agents/implementer.toml"\n\n` +
  `[agents.tester]\ndescription = "QA engineer that writes and runs tests"\nconfig_file = ".codex/agents/tester.toml"\n\n` +
  `[agents.documenter]\ndescription = "Technical writer that documents tested and approved code"\nconfig_file = ".codex/agents/documenter.toml"\n`;

describe("mergeCodexConfig", () => {
  it("generates agent blocks for null input", () => {
    expect(mergeCodexConfig(null)).toBe(EXPECTED_AGENT_BLOCKS);
  });

  it("generates agent blocks for empty string input", () => {
    expect(mergeCodexConfig("")).toBe(EXPECTED_AGENT_BLOCKS);
  });

  it("appends agent blocks when no [agents] section exists", () => {
    const existing = `# Some comment\n[mcp_servers.reporag]\ncommand = "test"`;
    expect(mergeCodexConfig(existing)).toBe(`${existing}\n\n${EXPECTED_AGENT_BLOCKS}`);
  });

  it("replaces old [agents] directory format with new per-role blocks", () => {
    const existing = `# Some comment\n[mcp_servers.reporag]\ncommand = "test"\n\n[agents]\ndirectory = ".codex/agents"`;
    expect(mergeCodexConfig(existing)).toBe(`# Some comment\n[mcp_servers.reporag]\ncommand = "test"\n\n${EXPECTED_AGENT_BLOCKS}`);
  });

  it("preserves content around old [agents] section and replaces with new blocks", () => {
    const existing = `# Some comment\n[mcp_servers.reporag]\ncommand = "test"\n\n[agents]\ndirectory = ".codex/agents"\n\n[other_section]\nkey = "value"`;
    expect(mergeCodexConfig(existing)).toBe(`# Some comment\n[mcp_servers.reporag]\ncommand = "test"\n\n[other_section]\nkey = "value"\n\n${EXPECTED_AGENT_BLOCKS}`);
  });

  it("replaces existing [agents.*] blocks on re-run", () => {
    const existing = `[mcp_servers.reporag]\ncommand = "test"\n\n[agents.planner]\ndescription = "old"\nconfig_file = ".codex/agents/planner.toml"`;
    expect(mergeCodexConfig(existing)).toBe(`[mcp_servers.reporag]\ncommand = "test"\n\n${EXPECTED_AGENT_BLOCKS}`);
  });
});

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

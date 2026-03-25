import path from "node:path";

import { readConfig } from "../core/schema.js";
import { isLegacyConfig, readRuntimeConfig } from "../runtime/config.js";
import type { AgentflowRuntimeConfig } from "../runtime/config.js";
import { migrateLegacyConfig } from "../runtime/migration.js";
import { isExecutableInPath, exists } from "../utils/fs.js";
import { header, info, warn, success, error } from "../utils/logger.js";

type OverallStatus = "healthy" | "needs-migration" | "legacy-detected" | "degraded";

const LEGACY_ROLE_FILES = [
  ".codex/agents/planner.toml",
  ".codex/agents/implementer.toml",
  ".codex/agents/tester.toml",
  ".codex/agents/documenter.toml",
  ".claude/agents/planner.md",
  ".claude/agents/implementer.md",
  ".claude/agents/tester.md",
  ".claude/agents/documenter.md",
  ".opencode/agents/planner.md",
  ".opencode/agents/implementer.md",
  ".opencode/agents/tester.md",
  ".opencode/agents/documenter.md",
];

const PROVIDER_BINARIES: Record<string, string> = {
  "claude-code": "claude",
  codex: "codex",
  opencode: "opencode",
};

export async function runStatusCommand(cwd: string): Promise<void> {
  // Try runtime-first config
  let runtimeConfig: AgentflowRuntimeConfig | null = await readRuntimeConfig(cwd);
  let isLegacy = false;

  if (!runtimeConfig) {
    const raw = await readConfig(cwd);
    if (!raw) {
      error("No .agentflow.json found. Run agentflow init first.");
      process.exitCode = 1;
      return;
    }
    if (isLegacyConfig(raw)) {
      isLegacy = true;
      runtimeConfig = migrateLegacyConfig(raw as never);
    } else {
      error("Config format unrecognized.");
      process.exitCode = 1;
      return;
    }
  }

  const config = runtimeConfig;

  header(`agentflow v${config.version}`);
  console.log("");

  // Runtime mode
  console.log(`Runtime mode:  ${config.runtime.mode}`);
  console.log(`Default provider: ${config.runtime.defaultProvider ?? "(not set)"}`);
  console.log("");

  // Configured providers
  console.log("Configured tools:");
  for (const tool of config.tools) {
    console.log(`  ${tool}`);
  }
  console.log("");

  // Provider availability
  console.log("Provider availability:");
  const availableProviders: string[] = [];
  for (const tool of config.tools) {
    const binary = PROVIDER_BINARIES[tool] ?? tool;
    const available = await isExecutableInPath(binary);
    if (available) availableProviders.push(tool);
    console.log(`  ${available ? "✓" : "✗"} ${tool} (${binary})`);
  }
  console.log("");

  // Role bindings
  console.log("Role bindings:");
  for (const role of ["planner", "implementer", "tester", "documenter"] as const) {
    const r = config.roles[role];
    console.log(`  ${role}: provider=${r.provider} model=${r.model}`);
  }
  console.log("");

  // Bootstrap files
  console.log("Bootstrap files:");
  if (config.tools.includes("claude-code")) {
    const p = path.join(cwd, ".claude", "skills", "agentflow", "SKILL.md");
    console.log(`  ${(await exists(p)) ? "✓" : "✗"} .claude/skills/agentflow/SKILL.md`);
  }
  if (config.tools.includes("codex")) {
    const p = path.join(cwd, ".agents", "skills", "agentflow", "SKILL.md");
    console.log(`  ${(await exists(p)) ? "✓" : "✗"} .agents/skills/agentflow/SKILL.md`);
  }
  if (config.tools.includes("opencode")) {
    const p = path.join(cwd, ".opencode", "agents", "agentflow.md");
    console.log(`  ${(await exists(p)) ? "✓" : "✗"} .opencode/agents/agentflow.md`);
  }
  console.log("");

  // Legacy files detection
  const foundLegacy: string[] = [];
  for (const rel of LEGACY_ROLE_FILES) {
    if (await exists(path.join(cwd, rel))) {
      foundLegacy.push(rel);
    }
  }

  // Overall status
  let overallStatus: OverallStatus;
  if (isLegacy) {
    overallStatus = "needs-migration";
  } else if (foundLegacy.length > 0) {
    overallStatus = "legacy-detected";
  } else if (availableProviders.length === 0) {
    overallStatus = "degraded";
  } else {
    overallStatus = "healthy";
  }

  if (isLegacy) {
    warn("Config is in legacy format. Run agentflow update to migrate.");
  }

  if (foundLegacy.length > 0) {
    warn(`Legacy role files detected (${foundLegacy.length}). These are no longer managed:`);
    for (const f of foundLegacy) {
      console.log(`    ${f}`);
    }
  }

  console.log("");
  const statusLine = `Status: ${overallStatus}`;
  if (overallStatus === "healthy") {
    success(statusLine);
  } else if (overallStatus === "degraded") {
    error(statusLine);
  } else {
    warn(statusLine);
  }
}

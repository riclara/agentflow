import path from "node:path";

import { readConfig } from "../core/schema.js";
import { AGENTFLOW_VERSION } from "../core/schema.js";
import { isLegacyConfig, readRuntimeConfig, writeRuntimeConfig } from "../runtime/config.js";
import type { AgentflowRuntimeConfig } from "../runtime/config.js";
import { migrateLegacyConfig } from "../runtime/migration.js";
import { renderClaudeBootstrapSkill } from "../templates/bootstrap/claude-skill.js";
import { renderCodexBootstrapSkill } from "../templates/bootstrap/codex-skill.js";
import { renderOpencodeBootstrapAgent } from "../templates/bootstrap/opencode-agent.js";
import { exists, writeText } from "../utils/fs.js";
import { formatAction, info, success, warn } from "../utils/logger.js";

export interface UpdateCommandOptions {
  dryRun?: boolean;
  force?: boolean;
}

interface BootstrapEntry {
  rel: string;
  abs: string;
  content: string;
}

function getBootstrapEntries(cwd: string, config: AgentflowRuntimeConfig): BootstrapEntry[] {
  const entries: BootstrapEntry[] = [];
  if (config.tools.includes("claude-code")) {
    const rel = ".claude/skills/agentflow/SKILL.md";
    entries.push({ rel, abs: path.join(cwd, rel), content: renderClaudeBootstrapSkill() });
  }
  if (config.tools.includes("codex")) {
    const rel = ".agents/skills/agentflow/SKILL.md";
    entries.push({ rel, abs: path.join(cwd, rel), content: renderCodexBootstrapSkill() });
    const rel2 = ".codex/agents/agentflow.md";
    entries.push({ rel: rel2, abs: path.join(cwd, rel2), content: renderCodexBootstrapSkill() });
  }
  if (config.tools.includes("opencode")) {
    const rel = ".opencode/agents/agentflow.md";
    entries.push({ rel, abs: path.join(cwd, rel), content: renderOpencodeBootstrapAgent() });
  }
  return entries;
}

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

export async function runUpdateCommand(cwd: string, options: UpdateCommandOptions): Promise<void> {
  // Load config — migrate legacy in memory if needed
  let runtimeConfig: AgentflowRuntimeConfig | null = await readRuntimeConfig(cwd);
  let wasLegacy = false;

  if (!runtimeConfig) {
    const raw = await readConfig(cwd);
    if (!raw) {
      throw new Error("No .agentflow.json found. Run `agentflow init` first.");
    }
    if (!isLegacyConfig(raw)) {
      throw new Error("Config format unrecognized.");
    }
    wasLegacy = true;
    runtimeConfig = migrateLegacyConfig(raw as never);
  }

  if (wasLegacy) {
    warn("Legacy config detected — will migrate to runtime-first format.");
  }

  // Determine if bootstrap files need rewriting
  const config = runtimeConfig;
  const entries = getBootstrapEntries(cwd, config);
  const needsUpdate = options.force || wasLegacy || config.version !== AGENTFLOW_VERSION;

  if (!needsUpdate) {
    for (const entry of entries) {
      console.log(formatAction("SKIP", entry.rel, "current"));
    }
    info("Bootstrap files are already current.");
    return;
  }

  // Plan actions
  for (const entry of entries) {
    const action = (await exists(entry.abs)) ? "OVERWRITE" : "CREATE";
    console.log(formatAction(action, entry.rel));
  }

  if (options.dryRun) {
    info("Dry run complete. No files were written.");
    return;
  }

  // Write bootstrap files
  for (const entry of entries) {
    await writeText(entry.abs, entry.content);
  }

  // Persist migrated / updated config with current version
  const updatedConfig: AgentflowRuntimeConfig = {
    ...config,
    version: AGENTFLOW_VERSION,
  };
  await writeRuntimeConfig(cwd, updatedConfig);

  // Warn about legacy role files (don't delete them)
  const foundLegacy: string[] = [];
  for (const rel of LEGACY_ROLE_FILES) {
    if (await exists(path.join(cwd, rel))) {
      foundLegacy.push(rel);
    }
  }
  if (foundLegacy.length > 0) {
    warn(`Legacy role files detected (${foundLegacy.length}). They are no longer managed and can be removed:`);
    for (const f of foundLegacy) {
      console.log(`    ${f}`);
    }
  }

  success(`Updated to v${AGENTFLOW_VERSION}${wasLegacy ? " (migrated from legacy config)" : ""}.`);
}

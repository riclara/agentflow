import path from "node:path";

import { CONFIG_FILE } from "../core/schema.js";
import { removeFileIfExists, exists } from "../utils/fs.js";
import { success, warn } from "../utils/logger.js";

/**
 * Bootstrap files managed by agentflow in runtime-first mode.
 * These are the only files eject needs to remove.
 */
const BOOTSTRAP_FILES = [
  ".claude/skills/agentflow/SKILL.md",
  ".agents/skills/agentflow/SKILL.md",
  ".opencode/agents/agentflow.md",
];

export async function runEjectCommand(cwd: string): Promise<void> {
  if (!(await exists(path.join(cwd, CONFIG_FILE)))) {
    throw new Error("No .agentflow.json found. Run `agentflow init` first.");
  }

  // Remove bootstrap files (runtime-first managed outputs)
  for (const rel of BOOTSTRAP_FILES) {
    const abs = path.join(cwd, rel);
    if (await exists(abs)) {
      await removeFileIfExists(abs);
      console.log(`  removed ${rel}`);
    }
  }

  // Remove config
  await removeFileIfExists(path.join(cwd, CONFIG_FILE));

  warn("Vendor role files (.claude/agents/, .codex/agents/, .opencode/agents/) are not removed automatically.");
  warn("Remove them manually if no longer needed.");

  success("agentflow management removed.");
}

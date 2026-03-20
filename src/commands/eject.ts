import path from "node:path";

import { stripAgentflowMarkers, stripVersionComment } from "../core/merger.js";
import { CONFIG_FILE, readConfig } from "../core/schema.js";
import { readTextIfExists, removeFileIfExists, writeText } from "../utils/fs.js";
import { success } from "../utils/logger.js";

export async function runEjectCommand(cwd: string): Promise<void> {
  const config = await readConfig(cwd);
  if (!config) {
    throw new Error("No .agentflow.json found. Run `agentflow init` first.");
  }

  for (const targetPath of Object.keys(config.managedFiles)) {
    const absolutePath = path.join(cwd, targetPath);
    const content = await readTextIfExists(absolutePath);
    if (content === null) {
      continue;
    }

    const nextContent =
      targetPath === "CLAUDE.md" || targetPath === "AGENTS.md"
        ? stripAgentflowMarkers(content)
        : stripVersionComment(content);

    await writeText(absolutePath, nextContent);
  }

  await removeFileIfExists(path.join(cwd, CONFIG_FILE));
  success("agentflow management removed. Generated files remain in place.");
}

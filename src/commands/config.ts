import path from "node:path";

import { renderManagedFile } from "../core/generator.js";
import { getConfigValue, readConfig, setConfigValue, writeConfig } from "../core/schema.js";
import { writeText } from "../utils/fs.js";
import { success } from "../utils/logger.js";

export async function showConfigCommand(cwd: string): Promise<void> {
  const config = await readConfig(cwd);
  if (!config) {
    throw new Error("No .agentflow.json found. Run `agentflow init` first.");
  }

  console.log(JSON.stringify(config, null, 2));
}

export async function getConfigCommand(cwd: string, targetPath: string): Promise<void> {
  const config = await readConfig(cwd);
  if (!config) {
    throw new Error("No .agentflow.json found. Run `agentflow init` first.");
  }

  const value = getConfigValue(config, targetPath);
  if (typeof value === "undefined") {
    throw new Error(`Unknown config path: ${targetPath}`);
  }

  if (typeof value === "object") {
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  console.log(String(value));
}

export async function setConfigCommand(cwd: string, targetPath: string, value: string): Promise<void> {
  const config = await readConfig(cwd);
  if (!config) {
    throw new Error("No .agentflow.json found. Run `agentflow init` first.");
  }

  const nextConfig = setConfigValue(config, targetPath, value);

  for (const filePath of Object.keys(nextConfig.managedFiles)) {
    const content = await renderManagedFile(cwd, nextConfig, filePath, "merge");
    if (content === null) {
      continue;
    }

    await writeText(path.join(cwd, filePath), content);
  }

  await writeConfig(cwd, nextConfig);
  success(`Updated ${targetPath}.`);
}

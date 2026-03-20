import path from "node:path";

import { collectTemplateHealth } from "../core/health.js";
import { renderManagedFile } from "../core/generator.js";
import { AGENTFLOW_VERSION, readConfig, writeConfig } from "../core/schema.js";
import { exists, writeText } from "../utils/fs.js";
import { formatAction, info, success, warn } from "../utils/logger.js";

export interface UpdateCommandOptions {
  dryRun?: boolean;
  force?: boolean;
}

export async function runUpdateCommand(cwd: string, options: UpdateCommandOptions): Promise<void> {
  const config = await readConfig(cwd);
  if (!config) {
    throw new Error("No .agentflow.json found. Run `agentflow init` first.");
  }

  const health = await collectTemplateHealth(cwd, config);
  const shouldRewriteManagedFiles =
    Boolean(options.force) || config.version !== AGENTFLOW_VERSION || health.status !== "healthy";

  if (!shouldRewriteManagedFiles) {
    for (const targetPath of Object.keys(config.managedFiles)) {
      console.log(formatAction("SKIP", targetPath, "current + healthy"));
    }
    info("Managed files are already current and healthy.");
    return;
  }

  const rewrittenPaths: string[] = [];

  for (const targetPath of Object.keys(config.managedFiles)) {
    const content = await renderManagedFile(cwd, config, targetPath, "merge");
    if (content === null) {
      warn(`Skipping unmanaged template path: ${targetPath}`);
      continue;
    }

    const action = (await exists(path.join(cwd, targetPath))) ? config.managedFiles[targetPath] === "partial" ? "MERGE" : "OVERWRITE" : "CREATE";
    console.log(formatAction(action, targetPath));

    if (!options.dryRun) {
      await writeText(path.join(cwd, targetPath), content);
      rewrittenPaths.push(targetPath);
    }
  }

  if (options.dryRun) {
    info("Dry run complete. No files were written.");
    return;
  }

  const nextConfig = {
    ...config,
    version: AGENTFLOW_VERSION,
  };
  await writeConfig(cwd, nextConfig);

  const nextHealth = await collectTemplateHealth(cwd, nextConfig);
  const blockingFailures = nextHealth.checks.filter((check) => check.managed && check.status !== "healthy");
  if (blockingFailures.length > 0) {
    throw new Error(
      `Managed files were rewritten but template health is still invalid: ${blockingFailures
        .map((check) => `${check.label} (${check.reason})`)
        .join("; ")}`,
    );
  }

  const unresolvedIncompatible = nextHealth.checks.filter((check) => !check.managed && check.status === "incompatible");
  for (const check of unresolvedIncompatible) {
    warn(`Unmanaged template remains incompatible: ${check.label} (${check.reason})`);
  }

  success(`Updated ${rewrittenPaths.length} managed files to v${AGENTFLOW_VERSION}.`);
}

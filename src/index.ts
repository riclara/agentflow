#!/usr/bin/env node

import { Command } from "commander";

import { runAgentCommand } from "./commands/agent.js";
import { getConfigCommand, setConfigCommand, showConfigCommand } from "./commands/config.js";
import { runEjectCommand } from "./commands/eject.js";
import { runInitCommand } from "./commands/init.js";
import { runStatusCommand } from "./commands/status.js";
import { runUpdateCommand } from "./commands/update.js";
import { AGENTFLOW_VERSION, NPM_PACKAGE_NAME } from "./core/schema.js";
import * as logger from "./utils/logger.js";
import { checkForUpdate } from "./utils/version-check.js";

const program = new Command();

program.name("agentflow").description("Configure a multi-agent workflow for coding tools.").version(AGENTFLOW_VERSION);

program
  .command("init")
  .description("Interactive setup that detects tools and generates configs.")
  .option("--tools <list>", "Comma-separated: claude-code,codex,opencode. Skip detection.")
  .option("--all", "Generate for all tools regardless of detection.")
  .option("-y, --yes", "Accept all defaults, no interactive prompts.")
  .option("--model-planner <model>", "Override planner model.")
  .option("--model-implementer <model>", "Override implementer model.")
  .option("--model-tester <model>", "Override tester model.")
  .option("--model-documenter <model>", "Override documenter model.")
  .option("--max-iterations <n>", "Max review loop iterations.")
  .option("--dry-run", "Show what would be created without writing.")
  .action(async (options) => {
    await runInitCommand(process.cwd(), options);
  });

program
  .command("status")
  .description("Show what's configured.")
  .action(async () => {
    await runStatusCommand(process.cwd());
  });

program
  .command("update")
  .description("Update prompts and generated files without touching custom settings.")
  .option("--dry-run", "Show what would change without writing.")
  .option("--force", "Rewrite managed files even if the version is current.")
  .action(async (options) => {
    await runUpdateCommand(process.cwd(), options);
  });

const configCommand = program.command("config").description("View or edit project settings.");

configCommand.action(async () => {
  await showConfigCommand(process.cwd());
});

configCommand
  .command("get")
  .description("Get a config value by dotted path.")
  .argument("<path>", "Config path, for example models.planner")
  .action(async (targetPath: string) => {
    await getConfigCommand(process.cwd(), targetPath);
  });

configCommand
  .command("set")
  .description("Set a config value by dotted path.")
  .argument("<path>", "Config path, for example workflow.maxIterations")
  .argument("<value>", "New config value")
  .action(async (targetPath: string, value: string) => {
    await setConfigCommand(process.cwd(), targetPath, value);
  });

const agentCommand = program.command("agent").description("Run a single agent role.");

agentCommand
  .command("run")
  .description("Execute a single role with an explicit task.")
  .argument("<role>", "planner | implementer | tester | documenter")
  .requiredOption("--task <text>", "Task description to pass to the agent.")
  .option("--provider <id>", "Override provider: claude-code | codex | opencode")
  .option("--model <name>", "Override model name.")
  .option("--feature <slug>", "Feature slug for artifact routing.")
  .option("--json", "Output result as JSON.")
  .action(async (role: string, options) => {
    await runAgentCommand(process.cwd(), role, options);
  });

program
  .command("eject")
  .description("Remove CLI management while keeping generated files.")
  .action(async () => {
    await runEjectCommand(process.cwd());
  });

const updateCheck = checkForUpdate(AGENTFLOW_VERSION);

try {
  await program.parseAsync(process.argv);
  const latest = await updateCheck;
  if (latest) {
    logger.info(
      `agentflow v${latest} available (current: v${AGENTFLOW_VERSION})\n  Run: npm update -g ${NPM_PACKAGE_NAME} && agentflow update`,
    );
  }
} catch (caughtError) {
  if (caughtError instanceof Error && caughtError.message) {
    logger.error(caughtError.message);
    process.exitCode = 1;
  } else {
    throw caughtError;
  }
}

import path from "node:path";

import { collectTemplateHealth } from "../core/health.js";
import { detectTools, parseToolList, TOOL_GROUPS } from "../core/detector.js";
import { buildManagedFiles, planGeneration, writeGenerationPlan } from "../core/generator.js";
import { summarizeCodexMappings } from "../core/models.js";
import {
  AGENTFLOW_VERSION,
  CONFIG_FILE,
  createConfig,
  DEFAULT_MODELS,
  DEFAULT_PROJECT,
  readConfig,
  type AgentflowConfig,
  type ToolId,
  writeConfig,
} from "../core/schema.js";
import { exists } from "../utils/fs.js";
import { formatAction, header, info, success, warn } from "../utils/logger.js";
import { promptCheckbox, promptConfirm, promptInput, promptSelect } from "../utils/prompts.js";

export interface InitCommandOptions {
  tools?: string;
  all?: boolean;
  yes?: boolean;
  modelPlanner?: string;
  modelImplementer?: string;
  modelTester?: string;
  modelDocumenter?: string;
  maxIterations?: string;
  dryRun?: boolean;
}

export async function runInitCommand(cwd: string, options: InitCommandOptions): Promise<void> {
  const nonInteractive = Boolean(options.yes);
  const existingConfig = await readConfig(cwd);

  if (existingConfig) {
    const resolution = await promptSelect<"reinitialize" | "abort">(
      `${CONFIG_FILE} already exists. What should agentflow do?`,
      [
        { name: "Reinitialize", value: "reinitialize" },
        { name: "Abort", value: "abort" },
      ],
      "reinitialize",
      { nonInteractive },
    );

    if (resolution === "abort") {
      info("Initialization aborted.");
      return;
    }
  }

  const detection = options.tools || options.all ? null : await detectTools(cwd);
  const selectedTools = await resolveTools(options, detection?.detectedGroups ?? [], nonInteractive);
  const project = {
    language: await promptInput("Project language?", existingConfig?.project.language ?? DEFAULT_PROJECT.language, {
      nonInteractive,
    }),
    framework: await promptInput("Framework?", existingConfig?.project.framework ?? DEFAULT_PROJECT.framework, {
      nonInteractive,
    }),
    testRunner: await promptInput(
      "Test runner command?",
      existingConfig?.project.testRunner ?? DEFAULT_PROJECT.testRunner,
      { nonInteractive },
    ),
  };

  const models = {
    planner: await promptInput("Planner model?", options.modelPlanner ?? existingConfig?.models.planner ?? DEFAULT_MODELS.planner, {
      nonInteractive,
    }),
    implementer: await promptInput(
      "Implementer model?",
      options.modelImplementer ?? existingConfig?.models.implementer ?? DEFAULT_MODELS.implementer,
      { nonInteractive },
    ),
    tester: await promptInput("Tester model?", options.modelTester ?? existingConfig?.models.tester ?? DEFAULT_MODELS.tester, {
      nonInteractive,
    }),
    documenter: await promptInput(
      "Documenter model?",
      options.modelDocumenter ?? existingConfig?.models.documenter ?? DEFAULT_MODELS.documenter,
      {
        nonInteractive,
      },
    ),
  };

  const maxReviewIterations = options.maxIterations
    ? Number.parseInt(options.maxIterations, 10)
    : existingConfig?.workflow.maxReviewIterations ?? 3;

  if (!Number.isInteger(maxReviewIterations) || maxReviewIterations < 1) {
    throw new Error("--max-iterations must be an integer greater than or equal to 1.");
  }

  const claudeMdMode =
    selectedTools.includes("claude-code") && (await exists(path.join(cwd, "CLAUDE.md")))
      ? await promptSelect<"merge" | "skip" | "overwrite">(
          "CLAUDE.md already exists. How should its workflow section be handled?",
          [
            { name: "Merge workflow section", value: "merge" },
            { name: "Skip", value: "skip" },
            { name: "Overwrite file", value: "overwrite" },
          ],
          "merge",
          { nonInteractive },
        )
      : "merge";

  const agentsMdMode =
    selectedTools.includes("codex") && (await exists(path.join(cwd, "AGENTS.md")))
      ? await promptSelect<"merge" | "skip" | "overwrite">(
          "AGENTS.md already exists. How should its workflow section be handled?",
          [
            { name: "Merge workflow section", value: "merge" },
            { name: "Skip", value: "skip" },
            { name: "Overwrite file", value: "overwrite" },
          ],
          "merge",
          { nonInteractive },
        )
      : "merge";

  const config = createConfig({
    tools: selectedTools,
    models,
    workflow: {
      maxReviewIterations,
    },
    project,
    managedFiles: {},
  });

  const codexMappings = selectedTools.includes("codex") ? summarizeCodexMappings(config.models) : [];
  if (codexMappings.length > 0) {
    info(`Codex uses OpenAI models. Mapping ${codexMappings.join(" and ")}.`);
    info('Override per agent: agentflow config set models.planner gpt-5-pro');
  }

  const plan = await planGeneration(cwd, config, {
    claudeMdMode,
    agentsMdMode,
  });

  const configAction = existingConfig ? "OVERWRITE" : "CREATE";

  header(`Files to ${options.dryRun ? "generate" : "create"}:`);
  for (const entry of plan) {
    console.log(`  ${formatAction(entry.action, entry.path)}`);
  }
  console.log(`  ${formatAction(configAction, CONFIG_FILE)}`);

  if (options.dryRun) {
    info("Dry run complete. No files were written.");
    return;
  }

  const confirmed = await promptConfirm("Proceed?", true, { nonInteractive });
  if (!confirmed) {
    info("Initialization aborted.");
    return;
  }

  const writtenPaths = await writeGenerationPlan(cwd, plan);
  const finalConfig: AgentflowConfig = {
    ...config,
    version: AGENTFLOW_VERSION,
    managedFiles: buildManagedFiles(config, writtenPaths),
  };

  const health = await collectTemplateHealth(cwd, finalConfig);
  if (health.status !== "healthy") {
    throw new Error(
      `Generated templates failed post-generation validation: ${health.checks
        .filter((check) => check.status !== "healthy")
        .map((check) => `${check.label} (${check.reason})`)
        .join("; ")}`,
    );
  }

  await writeConfig(cwd, finalConfig);

  success(`agentflow ${AGENTFLOW_VERSION} initialized.`);
}

async function resolveTools(
  options: InitCommandOptions,
  detectedGroups: ToolId[],
  nonInteractive: boolean,
): Promise<ToolId[]> {
  if (options.all) {
    return ["claude-code", "codex", "opencode"];
  }

  if (options.tools) {
    return parseToolList(options.tools);
  }

  const defaults: ToolId[] =
    detectedGroups.length > 0 ? detectedGroups : ["claude-code", "codex", "opencode"];
  const selections = await promptCheckbox(
    detectedGroups.length > 0
      ? `Which tools to configure? (detected: ${detectedGroups.join(", ")})`
      : "Which tools to configure?",
    TOOL_GROUPS.map((group) => ({
      name: group.label,
      value: group.id,
      checked: defaults.includes(group.id),
      description: group.description,
    })),
    defaults,
    { nonInteractive },
  );

  if (selections.length === 0) {
    throw new Error("Select at least one tool.");
  }

  return selections;
}

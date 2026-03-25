import path from "node:path";

import { detectTools, parseToolList, TOOL_GROUPS } from "../core/detector.js";
import {
  AGENTFLOW_SCHEMA_URL,
  AGENTFLOW_VERSION,
  CONFIG_FILE,
  DEFAULT_MODELS,
  DEFAULT_PROJECT,
  DEFAULT_WORKFLOW,
  readConfig,
  type ToolId,
} from "../core/schema.js";
import { renderDocumenterPrompt } from "../templates/prompts/documenter.js";
import { renderImplementerPrompt } from "../templates/prompts/implementer.js";
import { renderPlannerPrompt } from "../templates/prompts/planner.js";
import { renderTesterPrompt } from "../templates/prompts/tester.js";
import { renderClaudeBootstrapSkill } from "../templates/bootstrap/claude-skill.js";
import { renderCodexBootstrapSkill } from "../templates/bootstrap/codex-skill.js";
import { renderOpencodeBootstrapAgent } from "../templates/bootstrap/opencode-agent.js";
import type { ProviderId } from "../runtime/config.js";
import { isLegacyConfig, writeRuntimeConfig } from "../runtime/config.js";
import { exists, writeText } from "../utils/fs.js";
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

interface BootstrapFile {
  path: string;
  content: string;
}

function bootstrapFiles(tools: ToolId[], cwd: string): BootstrapFile[] {
  const files: BootstrapFile[] = [];
  if (tools.includes("claude-code")) {
    files.push({
      path: path.join(cwd, ".claude", "skills", "agentflow", "SKILL.md"),
      content: renderClaudeBootstrapSkill(),
    });
  }
  if (tools.includes("codex")) {
    files.push({
      path: path.join(cwd, ".agents", "skills", "agentflow", "SKILL.md"),
      content: renderCodexBootstrapSkill(),
    });
  }
  if (tools.includes("opencode")) {
    files.push({
      path: path.join(cwd, ".opencode", "agents", "agentflow.md"),
      content: renderOpencodeBootstrapAgent(),
    });
  }
  return files;
}

export async function runInitCommand(cwd: string, options: InitCommandOptions): Promise<void> {
  const nonInteractive = Boolean(options.yes);

  // Check for existing config (legacy or runtime-first)
  const existingRaw = await readConfig(cwd);
  if (existingRaw) {
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

  // Detect + select tools
  const detection = options.tools || options.all ? null : await detectTools(cwd);
  const selectedTools = await resolveTools(options, detection?.detectedGroups ?? [], nonInteractive);

  // Project settings
  const project = {
    language: await promptInput("Project language?", existingRaw?.project?.language ?? DEFAULT_PROJECT.language, {
      nonInteractive,
    }),
    framework: await promptInput("Framework?", existingRaw?.project?.framework ?? DEFAULT_PROJECT.framework, {
      nonInteractive,
    }),
    testRunner: await promptInput(
      "Test runner command?",
      existingRaw?.project?.testRunner ?? DEFAULT_PROJECT.testRunner,
      { nonInteractive },
    ),
  };

  // Compute default provider
  const computedDefaultProvider: ProviderId = selectedTools.includes("codex")
    ? "codex"
    : (selectedTools[0] as ProviderId);

  const defaultProvider = await promptSelect<ProviderId>(
    "Default provider for all roles?",
    [
      { name: "Claude Code", value: "claude-code" as ProviderId },
      { name: "Codex", value: "codex" as ProviderId },
      { name: "OpenCode", value: "opencode" as ProviderId },
    ].filter((c) => selectedTools.includes(c.value)),
    computedDefaultProvider,
    { nonInteractive },
  );

  // Model per role
  const existingModels = isLegacyConfig(existingRaw) ? (existingRaw as never as { models: Record<string, string> }).models : undefined;
  const models = {
    planner: await promptInput(
      "Planner model?",
      options.modelPlanner ?? existingModels?.planner ?? DEFAULT_MODELS.planner,
      { nonInteractive },
    ),
    implementer: await promptInput(
      "Implementer model?",
      options.modelImplementer ?? existingModels?.implementer ?? DEFAULT_MODELS.implementer,
      { nonInteractive },
    ),
    tester: await promptInput(
      "Tester model?",
      options.modelTester ?? existingModels?.tester ?? DEFAULT_MODELS.tester,
      { nonInteractive },
    ),
    documenter: await promptInput(
      "Documenter model?",
      options.modelDocumenter ?? existingModels?.documenter ?? DEFAULT_MODELS.documenter,
      { nonInteractive },
    ),
  };

  const maxReviewIterations = options.maxIterations
    ? Number.parseInt(options.maxIterations, 10)
    : DEFAULT_WORKFLOW.maxReviewIterations;

  if (!Number.isInteger(maxReviewIterations) || maxReviewIterations < 1) {
    throw new Error("--max-iterations must be an integer >= 1.");
  }

  // Build a minimal legacy-shape config to seed prompts from existing generators
  const configForPrompts = {
    $schema: AGENTFLOW_SCHEMA_URL,
    version: AGENTFLOW_VERSION,
    tools: selectedTools,
    models,
    workflow: { ...DEFAULT_WORKFLOW, maxReviewIterations },
    project,
    managedFiles: {},
  };

  const makeRole = (model: string, promptBase: string) => ({
    provider: defaultProvider,
    model,
    sandbox: "workspace-write" as const,
    prompt: { base: promptBase, providerOverrides: {} },
    providerModels: {},
  });

  // Bootstrap files (replace vendor role files as primary output)
  const files = bootstrapFiles(selectedTools, cwd);

  header(`Files to ${options.dryRun ? "generate" : "create"}:`);
  const configAction = existingRaw ? "OVERWRITE" : "CREATE";
  for (const file of files) {
    const rel = path.relative(cwd, file.path);
    const fileExists = await exists(file.path);
    console.log(`  ${formatAction(fileExists ? "OVERWRITE" : "CREATE", rel)}`);
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

  // Write bootstrap files
  for (const file of files) {
    await writeText(file.path, file.content);
    const rel = path.relative(cwd, file.path);
    const fileExists = await exists(file.path);
    console.log(`  ${formatAction(fileExists ? "OVERWRITE" : "CREATE", rel)}`);
  }

  // Write runtime-first config
  await writeRuntimeConfig(cwd, {
    $schema: AGENTFLOW_SCHEMA_URL,
    version: AGENTFLOW_VERSION,
    tools: selectedTools,
    workflow: { ...DEFAULT_WORKFLOW, maxReviewIterations },
    project,
    runtime: {
      mode: "cli-runtime",
      traceDir: ".agentflow/runs",
      defaultProvider,
    },
    roles: {
      planner: makeRole(models.planner, renderPlannerPrompt(configForPrompts as never)),
      implementer: makeRole(models.implementer, renderImplementerPrompt(configForPrompts as never)),
      tester: makeRole(models.tester, renderTesterPrompt(configForPrompts as never)),
      documenter: makeRole(models.documenter, renderDocumenterPrompt(configForPrompts as never)),
    },
  });

  if (selectedTools.includes("codex")) {
    warn("Legacy vendor role files (.codex/agents/*.toml, .claude/agents/*.md) are no longer generated by default.");
    warn("Run agentflow status to check for leftover legacy files.");
  }

  success(`agentflow ${AGENTFLOW_VERSION} initialized (runtime-first mode).`);
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

import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

import { detectProject, detectTools, parseToolList, TOOL_GROUPS } from "../core/detector.js";
import {
  AGENTFLOW_SCHEMA_URL,
  AGENTFLOW_VERSION,
  CONFIG_FILE,
  DEFAULT_WORKFLOW,
  type AgentId,
  type ToolId,
} from "../core/schema.js";
import { renderDocumenterPrompt } from "../templates/prompts/documenter.js";
import { renderImplementerPrompt } from "../templates/prompts/implementer.js";
import { renderPlannerPrompt } from "../templates/prompts/planner.js";
import { renderClassifierPrompt } from "../templates/prompts/classifier.js";
import { renderTesterPrompt } from "../templates/prompts/tester.js";
import { renderClaudeBootstrapSkill } from "../templates/bootstrap/claude-skill.js";
import { renderCodexBootstrapSkill } from "../templates/bootstrap/codex-skill.js";
import { renderOpencodeBootstrapAgent } from "../templates/bootstrap/opencode-agent.js";
import type { AgentRoleConfig, ProviderId } from "../runtime/config.js";
import { isLegacyConfig, readRuntimeConfig, writeRuntimeConfig } from "../runtime/config.js";
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

const PROVIDER_MODEL_CHOICES: Record<ProviderId, Array<{ name: string; value: string; description: string }>> = {
  "claude-code": [
    { name: "opus",   value: "opus",   description: "Most capable — best for planning and reasoning" },
    { name: "sonnet", value: "sonnet", description: "Balanced capability and speed — good default" },
    { name: "haiku",  value: "haiku",  description: "Fast and cheap — ideal for lightweight tasks" },
  ],
  codex: [
    { name: "gpt-5-codex",  value: "gpt-5-codex",  description: "Full Codex model — high capability" },
    { name: "gpt-5.4-mini", value: "gpt-5.4-mini", description: "Codex mini — faster and cheaper" },
  ],
  opencode: [
    { name: "anthropic/claude-opus-4-20250514",    value: "anthropic/claude-opus-4-20250514",    description: "Opus — most capable" },
    { name: "anthropic/claude-sonnet-4-20250514",  value: "anthropic/claude-sonnet-4-20250514",  description: "Sonnet — balanced" },
    { name: "anthropic/claude-haiku-4-5-20251001", value: "anthropic/claude-haiku-4-5-20251001", description: "Haiku — lightweight" },
  ],
};

const DEFAULT_PROVIDER_MODELS: Record<ProviderId, Record<AgentId, string>> = {
  "claude-code": { planner: "opus",         implementer: "sonnet",        tester: "sonnet",        documenter: "haiku" },
  codex:         { planner: "gpt-5-codex",  implementer: "gpt-5.4-mini",  tester: "gpt-5.4-mini",  documenter: "gpt-5.4-mini" },
  opencode:      { planner: "anthropic/claude-opus-4-20250514", implementer: "anthropic/claude-sonnet-4-20250514", tester: "anthropic/claude-sonnet-4-20250514", documenter: "anthropic/claude-haiku-4-5-20251001" },
};

const CLASSIFIER_MODEL: Record<ProviderId, string> = {
  "claude-code": "haiku",
  codex: "gpt-5.4-mini",
  opencode: "anthropic/claude-haiku-4-5-20251001",
};

const DEFAULT_EFFORT: Record<AgentId, string> = {
  planner: "high", implementer: "medium", tester: "medium", documenter: "low",
};

const EFFORT_CHOICES = [
  { name: "high",   value: "high",   description: "Maximum reasoning — slower, best for planning" },
  { name: "medium", value: "medium", description: "Balanced effort — good for most tasks" },
  { name: "low",    value: "low",    description: "Minimal reasoning — fastest, for simple tasks" },
];

const AGENT_META: Array<{ id: AgentId; label: string; pipelineContext: string; modelFlag: keyof InitCommandOptions }> = [
  { id: "planner",     label: "Planner",     pipelineContext: "Step 1 (plan) · Step 3 (review) — Creates architecture and reviews implementation", modelFlag: "modelPlanner" },
  { id: "implementer", label: "Implementer", pipelineContext: "Step 2 (implement) · Step 3 (fix) — Writes code and applies reviewer feedback",    modelFlag: "modelImplementer" },
  { id: "tester",      label: "Tester",      pipelineContext: "Step 4 (test) — Runs the test suite and reports failures",                          modelFlag: "modelTester" },
  { id: "documenter",  label: "Documenter",  pipelineContext: "Step 5 (document) — Generates docs and changelogs",                                 modelFlag: "modelDocumenter" },
];

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
    // .agents/skills/ — loaded automatically by Codex CLI
    files.push({
      path: path.join(cwd, ".agents", "skills", "agentflow", "SKILL.md"),
      content: renderCodexBootstrapSkill(),
    });
    // .codex/agents/ — makes @agentflow available in Codex App
    files.push({
      path: path.join(cwd, ".codex", "agents", "agentflow.md"),
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

  // Check for existing config (legacy or runtime-first) — use raw existence + runtime parse
  const configExists = await exists(path.join(cwd, CONFIG_FILE));
  const existingRuntime = configExists ? await readRuntimeConfig(cwd).catch(() => null) : null;

  if (configExists) {
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

  // Infer project settings from the codebase, preserve existing if present
  const detected = await detectProject(cwd);
  const project = {
    language:  existingRuntime?.project?.language  ?? detected.language,
    framework: existingRuntime?.project?.framework ?? detected.framework,
  };

  // Default provider = first selected tool (no question needed)
  const defaultProvider = selectedTools[0] as ProviderId;

  // Model + effort per role, per selected provider
  const existingRoles = existingRuntime?.roles as Record<AgentId, AgentRoleConfig> | undefined;

  // Fetch dynamic model list for opencode if selected
  const opencodeModelChoices = selectedTools.includes("opencode")
    ? await fetchOpencodeModelChoices()
    : undefined;

  const { modelsPerProvider, effortsPerProvider } = await resolveModels(
    selectedTools as ProviderId[],
    options,
    existingRoles,
    nonInteractive,
    opencodeModelChoices,
  );

  const maxReviewIterations = options.maxIterations
    ? Number.parseInt(options.maxIterations, 10)
    : DEFAULT_WORKFLOW.maxReviewIterations;

  if (!Number.isInteger(maxReviewIterations) || maxReviewIterations < 1) {
    throw new Error("--max-iterations must be an integer >= 1.");
  }

  const defaultModels = modelsPerProvider[defaultProvider];

  // Build a minimal legacy-shape config to seed prompts from existing generators
  const configForPrompts = {
    $schema: AGENTFLOW_SCHEMA_URL,
    version: AGENTFLOW_VERSION,
    tools: selectedTools,
    models: defaultModels,
    workflow: { ...DEFAULT_WORKFLOW, maxReviewIterations },
    project,
    managedFiles: {},
  };

  const makeRole = (agentId: AgentId, model: string, promptBase: string) => {
    const providerModels: Partial<Record<ProviderId, string>> = {};
    for (const tool of selectedTools as ProviderId[]) {
      if (tool !== defaultProvider) {
        providerModels[tool] = modelsPerProvider[tool][agentId];
      }
    }
    return {
      provider: defaultProvider,
      model,
      effort: effortsPerProvider[defaultProvider][agentId],
      sandbox: "workspace-write" as const,
      prompt: { base: promptBase, providerOverrides: {} },
      providerModels,
    };
  };

  const makeClassifierRole = (promptBase: string) => {
    const providerModels: Partial<Record<ProviderId, string>> = {};
    for (const tool of selectedTools as ProviderId[]) {
      if (tool !== defaultProvider) {
        providerModels[tool] = CLASSIFIER_MODEL[tool];
      }
    }
    return {
      provider: defaultProvider,
      model: CLASSIFIER_MODEL[defaultProvider],
      sandbox: "workspace-write" as const,
      prompt: { base: promptBase, providerOverrides: {} },
      providerModels,
    };
  };

  // Bootstrap files (replace vendor role files as primary output)
  const files = bootstrapFiles(selectedTools, cwd);

  header(`Files to ${options.dryRun ? "generate" : "create"}:`);
  const configAction = configExists ? "OVERWRITE" : "CREATE";
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
    const rel = path.relative(cwd, file.path);
    const fileExists = await exists(file.path);
    await writeText(file.path, file.content);
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
      planner:     makeRole("planner",     defaultModels.planner,     renderPlannerPrompt(configForPrompts as never)),
      implementer: makeRole("implementer", defaultModels.implementer, renderImplementerPrompt(configForPrompts as never)),
      tester:      makeRole("tester",      defaultModels.tester,      renderTesterPrompt(configForPrompts as never)),
      documenter:  makeRole("documenter",  defaultModels.documenter,  renderDocumenterPrompt(configForPrompts as never)),
      classifier:  makeClassifierRole(renderClassifierPrompt()),
    },
  });

  if (selectedTools.includes("codex")) {
    warn("Legacy vendor role files (.codex/agents/*.toml, .claude/agents/*.md) are no longer generated by default.");
    warn("Run agentflow status to check for leftover legacy files.");
  }

  success(`agentflow ${AGENTFLOW_VERSION} initialized (runtime-first mode).`);
  info("Restart your AI tool (Claude Code, Codex, OpenCode) to load the new skill files.");
}

type ModelChoice = { name: string; value: string; description: string };

async function fetchOpencodeModelChoices(): Promise<ModelChoice[] | null> {
  try {
    const { stdout } = await execFileAsync("opencode", ["models"], { timeout: 10_000 });
    const models = stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (models.length > 0) {
      return models.map((m) => ({ name: m, value: m, description: "" }));
    }
  } catch {
    // opencode CLI not available or command failed
  }
  return null;
}

async function resolveModels(
  selectedProviders: ProviderId[],
  options: InitCommandOptions,
  existingRoles: Record<AgentId, AgentRoleConfig> | undefined,
  nonInteractive: boolean,
  opencodeModelChoices?: ModelChoice[] | null,
): Promise<{
  modelsPerProvider: Record<ProviderId, Record<AgentId, string>>;
  effortsPerProvider: Record<ProviderId, Record<AgentId, string | undefined>>;
}> {
  // Ask once which roles to configure (applies to all providers)
  const agentsToConfig: AgentId[] = nonInteractive
    ? AGENT_META.map((a) => a.id)
    : await promptCheckbox<AgentId>(
        `Which roles to configure? (applies to: ${selectedProviders.join(", ")})`,
        AGENT_META.map((a) => ({ name: a.label, value: a.id, checked: true, description: a.pipelineContext })),
        AGENT_META.map((a) => a.id),
        { nonInteractive },
      );

  const modelsPerProvider = {} as Record<ProviderId, Record<AgentId, string>>;
  const effortsPerProvider = {} as Record<ProviderId, Record<AgentId, string | undefined>>;

  for (const provider of selectedProviders) {
    const isCodex = provider === "codex";
    const isOpencode = provider === "opencode";
    // null = opencode CLI unavailable → free-text input
    const modelChoices: ModelChoice[] | null =
      isOpencode
        ? (opencodeModelChoices ?? null)
        : PROVIDER_MODEL_CHOICES[provider];

    header(`\nConfiguring ${provider}`);
    if (isOpencode && modelChoices === null) {
      warn("opencode CLI not found — enter model IDs manually (e.g. anthropic/claude-sonnet-4-20250514).");
    }

    const models = {} as Record<AgentId, string>;
    const efforts = {} as Record<AgentId, string | undefined>;

    for (const agent of AGENT_META) {
      // CLI flags only apply to the default (first) provider
      const isDefault = provider === selectedProviders[0];
      const flagModel = isDefault ? (options[agent.modelFlag] as string | undefined) : undefined;

      // Existing model: check providerModels for non-default, role.model for default
      const existingModel = isDefault
        ? existingRoles?.[agent.id]?.model
        : existingRoles?.[agent.id]?.providerModels?.[provider];

      const defaultModel = flagModel ?? existingModel ?? DEFAULT_PROVIDER_MODELS[provider][agent.id];
      const defaultEffort = existingRoles?.[agent.id]?.effort ?? DEFAULT_EFFORT[agent.id];

      if (flagModel || !agentsToConfig.includes(agent.id)) {
        models[agent.id] = defaultModel;
        efforts[agent.id] = isCodex ? defaultEffort : undefined;
        continue;
      }

      info(agent.pipelineContext);

      if (modelChoices === null) {
        // opencode without CLI — free-text
        models[agent.id] = await promptInput(`${agent.label} model?`, defaultModel, { nonInteractive });
      } else {
        const safeDefault = modelChoices.some((c) => c.value === defaultModel)
          ? defaultModel
          : (modelChoices[0]?.value ?? defaultModel);

        models[agent.id] = await promptSelect(
          `${agent.label} model?`,
          modelChoices,
          safeDefault,
          { nonInteractive },
        );
      }

      if (isCodex) {
        efforts[agent.id] = await promptSelect(
          `${agent.label} reasoning effort?`,
          EFFORT_CHOICES,
          defaultEffort,
          { nonInteractive },
        );
      } else {
        efforts[agent.id] = undefined;
      }
    }

    modelsPerProvider[provider] = models;
    effortsPerProvider[provider] = efforts;
  }

  return { modelsPerProvider, effortsPerProvider };
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

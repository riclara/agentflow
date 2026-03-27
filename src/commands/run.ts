import { claudeAdapter } from "../runtime/providers/claude.js";
import { codexAdapter } from "../runtime/providers/codex.js";
import { opencodeAdapter } from "../runtime/providers/opencode.js";
import type { ProviderAdapter, RunRoleResult } from "../runtime/provider-adapter.js";
import {
  appendActivityLog,
  createFeatureDir,
  createTraceDir,
  featureArtifactPaths,
  generateRunId,
  slugify,
} from "../runtime/artifacts.js";
import { ProviderId, isLegacyConfig, readRuntimeConfig } from "../runtime/config.js";
import type { AgentflowRuntimeConfig, AgentId } from "../runtime/config.js";
import { migrateLegacyConfig } from "../runtime/migration.js";
import { resolveModel, resolvePrompt, resolveProvider } from "../runtime/roles.js";
import { validateProviderAvailable } from "../runtime/validation.js";
import { readConfig } from "../core/schema.js";
import { exists } from "../utils/fs.js";
import * as logger from "../utils/logger.js";

const ADAPTERS: Record<string, ProviderAdapter> = {
  "claude-code": claudeAdapter,
  codex: codexAdapter,
  opencode: opencodeAdapter,
};

export interface RunOptions {
  provider?: string;
  model?: string;
  json?: boolean;
}

async function runRole(
  role: AgentId,
  task: string,
  featureSlug: string,
  config: AgentflowRuntimeConfig,
  cwd: string,
  cliProvider: ProviderId | undefined,
  cliModel: string | undefined,
): Promise<RunRoleResult> {
  const provider = resolveProvider(role, config, cliProvider);
  const model = resolveModel(role, provider, config, cliModel);
  const prompt = resolvePrompt(role, provider, config);

  await validateProviderAvailable(provider);

  const runId = generateRunId();
  const traceDirPath = await createTraceDir(cwd, runId);

  const adapter = ADAPTERS[provider];
  if (!adapter) {
    throw new Error(`No adapter found for provider "${provider}".`);
  }
  return adapter.run({
    cwd,
    role,
    provider,
    model,
    sandbox: config.roles[role]!.sandbox,
    effort: config.roles[role]!.effort,
    prompt,
    task,
    featureSlug,
    traceDir: traceDirPath,
    json: false,
  });
}

export async function runPipelineCommand(
  cwd: string,
  featureDescription: string,
  options: RunOptions,
): Promise<void> {
  // Load config
  let runtimeConfig: AgentflowRuntimeConfig | null = await readRuntimeConfig(cwd);

  if (!runtimeConfig) {
    const legacyConfig = await readConfig(cwd);
    if (!legacyConfig) {
      logger.error("No .agentflow.json found. Run agentflow init first.");
      process.exitCode = 1;
      return;
    }
    if (!isLegacyConfig(legacyConfig)) {
      logger.error("Config format unrecognized.");
      process.exitCode = 1;
      return;
    }
    logger.warn("Legacy config detected — running with in-memory migration. Run agentflow update to persist.");
    runtimeConfig = migrateLegacyConfig(legacyConfig as never);
  }

  let cliProvider: ProviderId | undefined;
  if (options.provider) {
    const result = ProviderId.safeParse(options.provider);
    if (!result.success) {
      logger.error(`Invalid provider "${options.provider}". Expected: claude-code, codex, opencode.`);
      process.exitCode = 1;
      return;
    }
    cliProvider = result.data;
  }

  const slug = slugify(featureDescription);
  const featureDir = await createFeatureDir(cwd, slug);
  const paths = featureArtifactPaths(cwd, slug);

  logger.info(`Feature: ${featureDescription}`);
  logger.info(`Slug:    ${slug}`);
  logger.info(`Dir:     ${featureDir}`);

  await appendActivityLog(paths.activityLog, `pipeline started for: ${featureDescription}`);

  // Step 1: Planner — create plan.md
  logger.header("\n[1/5] Planning…");
  const planResult = await runRole(
    "planner",
    `Create a plan for: ${featureDescription}\n\nWrite the plan to: ${paths.plan}`,
    slug,
    runtimeConfig,
    cwd,
    cliProvider,
    options.model,
  );
  await appendActivityLog(paths.activityLog, `planner: ${planResult.ok ? "ok" : planResult.code ?? "failed"}`);
  if (!planResult.ok) {
    logger.error(`Planner failed: ${planResult.message ?? planResult.code}`);
    process.exitCode = 1;
    return;
  }
  logger.success("Plan created.");

  // Step 2: Implementer
  logger.header("\n[2/5] Implementing…");
  const implResult = await runRole(
    "implementer",
    `Implement the feature described in: ${paths.plan}`,
    slug,
    runtimeConfig,
    cwd,
    cliProvider,
    options.model,
  );
  await appendActivityLog(paths.activityLog, `implementer: ${implResult.ok ? "ok" : implResult.code ?? "failed"}`);
  if (!implResult.ok) {
    logger.error(`Implementer failed: ${implResult.message ?? implResult.code}`);
    process.exitCode = 1;
    return;
  }
  logger.success("Implementation complete.");

  // Step 3: Planner review loop
  const maxIterations = runtimeConfig.workflow.maxReviewIterations;
  let approved = false;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    logger.header(`\n[3/5] Review iteration ${iteration}/${maxIterations}…`);
    const reviewResult = await runRole(
      "planner",
      `Review the implementation against the plan in: ${paths.plan}\nWrite your review (APPROVED or revision requests) to: ${paths.review}`,
      slug,
      runtimeConfig,
      cwd,
      cliProvider,
      options.model,
    );
    await appendActivityLog(
      paths.activityLog,
      `review iteration ${iteration}: ${reviewResult.ok ? "ok" : reviewResult.code ?? "failed"}`,
    );

    if (!reviewResult.ok) {
      logger.error(`Review failed: ${reviewResult.message ?? reviewResult.code}`);
      process.exitCode = 1;
      return;
    }

    // Check if review.md was written and contains APPROVED
    if (await exists(paths.review)) {
      const { readText } = await import("../utils/fs.js");
      const reviewContent = await readText(paths.review);
      if (reviewContent.includes("APPROVED")) {
        approved = true;
        logger.success("Implementation approved.");
        break;
      }
    }

    if (iteration < maxIterations) {
      logger.info("Revisions requested — re-implementing…");
      const reImplResult = await runRole(
        "implementer",
        `Revise the implementation based on the review in: ${paths.review}\nOriginal plan: ${paths.plan}`,
        slug,
        runtimeConfig,
        cwd,
        cliProvider,
        options.model,
      );
      await appendActivityLog(
        paths.activityLog,
        `re-implementation iteration ${iteration}: ${reImplResult.ok ? "ok" : reImplResult.code ?? "failed"}`,
      );
      if (!reImplResult.ok) {
        logger.error(`Re-implementation failed: ${reImplResult.message ?? reImplResult.code}`);
        process.exitCode = 1;
        return;
      }
    }
  }

  if (!approved) {
    logger.warn("Max review iterations reached without explicit approval. Continuing to test.");
  }

  // Steps 4+5: Tester and Documenter in parallel
  logger.header("\n[4/5] Testing and documenting in parallel…");
  const testRunnerInstruction = "Auto-detect the test runner from the project (package.json scripts, vitest.config.*, jest.config.*, pytest.ini, go.mod, Cargo.toml, Gemfile) and run it.";

  const [testResult, docResult] = await Promise.all([
    runRole(
      "tester",
      `Run tests for the feature described in: ${paths.plan}\n${testRunnerInstruction}`,
      slug,
      runtimeConfig,
      cwd,
      cliProvider,
      options.model,
    ),
    runRole(
      "documenter",
      `Document the feature described in: ${paths.plan}`,
      slug,
      runtimeConfig,
      cwd,
      cliProvider,
      options.model,
    ),
  ]);

  await appendActivityLog(paths.activityLog, `tester: ${testResult.ok ? "ok" : testResult.code ?? "failed"}`);
  await appendActivityLog(paths.activityLog, `documenter: ${docResult.ok ? "ok" : docResult.code ?? "failed"}`);

  if (!testResult.ok) {
    logger.error(`Tests failed: ${testResult.message ?? testResult.code}`);
    if (!docResult.ok) {
      logger.warn(`Documentation also failed: ${docResult.message ?? docResult.code}`);
    }
    process.exitCode = 1;
    return;
  }
  logger.success("Tests passed.");

  if (!docResult.ok) {
    logger.warn(`Documentation step failed: ${docResult.message ?? docResult.code}`);
  } else {
    logger.success("Documentation complete.");
  }

  await appendActivityLog(paths.activityLog, "pipeline complete");
  logger.success(`\nPipeline complete for: ${featureDescription}`);

  if (options.json) {
    console.log(JSON.stringify({ ok: true, slug, featureDir, artifacts: paths }));
  }
}

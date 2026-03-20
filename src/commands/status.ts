import { collectTemplateHealth } from "../core/health.js";
import { readConfig } from "../core/schema.js";
import { header } from "../utils/logger.js";

export async function runStatusCommand(cwd: string): Promise<void> {
  const config = await readConfig(cwd);
  if (!config) {
    throw new Error("No .agentflow.json found. Run `agentflow init` first.");
  }

  header(`📊 agentflow v${config.version}`);
  console.log("");
  console.log("Tools:");
  console.log(
    `  ${config.tools.includes("claude-code") ? "✓" : "✗"} Claude Code + Cowork   ${
      config.tools.includes("claude-code") ? "1 skill, 4 agents (.md)" : "not configured"
    }`,
  );
  console.log(
    `  ${config.tools.includes("codex") ? "✓" : "✗"} Codex CLI + App        ${
      config.tools.includes("codex") ? "1 skill, 4 agents (.toml), AGENTS.md" : "not configured"
    }`,
  );
  console.log(
    `  ${config.tools.includes("opencode") ? "✓" : "✗"} OpenCode               ${
      config.tools.includes("opencode") ? "4 agents (.md), opencode.json" : "not configured"
    }`,
  );
  console.log("");
  console.log("Models:");
  console.log(`  Planner:      ${config.models.planner}`);
  console.log(`  Implementer:  ${config.models.implementer}`);
  console.log(`  Tester:       ${config.models.tester}`);
  console.log(`  Documenter:   ${config.models.documenter}`);
  console.log("");
  console.log("Workflow:");
  console.log(`  Max iterations:    ${config.workflow.maxReviewIterations}`);
  console.log(`  Plan granularity:  ${config.workflow.planGranularity}`);
  console.log(`  Test execution:    ${config.workflow.testerExecutes ? "auto" : "manual"}${config.workflow.testerAutoLoop ? " (loop back on failure)" : ""}`);
  console.log(`  Test command:      ${config.project.testRunner}`);

  const health = await collectTemplateHealth(cwd, config);
  console.log("");
  console.log(`Template Health: ${health.status}`);
  for (const check of health.checks) {
    console.log(`  ${formatHealthIcon(check.status)} ${check.label}: ${check.status} (${check.reason})`);
  }
}

function formatHealthIcon(status: "healthy" | "stale" | "incompatible"): string {
  switch (status) {
    case "healthy":
      return "✓";
    case "stale":
      return "!";
    case "incompatible":
      return "✗";
  }
}

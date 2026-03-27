import { isExecutableInPath, writeJson, writeText } from "../../utils/fs.js";
import { spawnWithPty } from "../../utils/process.js";
import { generateRunId, tracePaths } from "../artifacts.js";
import type { ProviderAdapter, RunProviderInput, RunRoleResult } from "../provider-adapter.js";

export const codexAdapter: ProviderAdapter = {
  id: "codex",

  async detect(_cwd: string): Promise<boolean> {
    return isExecutableInPath("codex");
  },

  async run(input: RunProviderInput): Promise<RunRoleResult> {
    const available = await isExecutableInPath("codex");
    if (!available) {
      return {
        ok: false,
        provider: "codex",
        role: input.role,
        model: input.model,
        code: "provider_unavailable",
        message: 'Binary "codex" not found in PATH.',
        retryable: false,
      };
    }

    const runId = generateRunId();
    const paths = tracePaths(input.cwd, runId);
    const fullPrompt = `${input.prompt}\n\n## Task\n\n${input.task}`;

    await writeJson(paths.request, {
      role: input.role,
      provider: "codex",
      model: input.model,
      effort: input.effort,
      sandbox: input.sandbox,
      featureSlug: input.featureSlug,
      task: input.task,
    });

    const args = [
      "exec",
      "--cd", input.cwd,
      "--sandbox", input.sandbox,
      ...(input.effort ? ["--reasoning-effort", input.effort] : []),
      fullPrompt,
    ];

    const { stdout, stderr, code } = await spawnWithPty("codex", args, {
      cwd: input.cwd,
    });

    if (code !== 0) {
      await writeText(paths.stdout, stdout + (stderr ? `\n--- stderr ---\n${stderr}` : ""));
      await writeJson(paths.result, { ok: false, code: "execution_failed", message: stderr || "non-zero exit" });

      return {
        ok: false,
        provider: "codex",
        role: input.role,
        model: input.model,
        runId,
        code: "execution_failed",
        message: stderr || "Process exited with non-zero code.",
        retryable: true,
      };
    }

    await writeText(paths.stdout, stdout);
    await writeJson(paths.result, { ok: true, summary: stdout.slice(0, 500) });

    return {
      ok: true,
      provider: "codex",
      role: input.role,
      model: input.model,
      runId,
      summary: stdout.slice(0, 500),
    };
  },
};

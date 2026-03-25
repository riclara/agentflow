import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { isExecutableInPath, writeJson, writeText } from "../../utils/fs.js";
import { generateRunId, tracePaths } from "../artifacts.js";
import type { ProviderAdapter, RunProviderInput, RunRoleResult } from "../provider-adapter.js";

const execFileAsync = promisify(execFile);

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
      sandbox: input.sandbox,
      featureSlug: input.featureSlug,
      task: input.task,
    });

    const args = ["exec", "--cd", input.cwd, "--sandbox", input.sandbox, fullPrompt];

    let stdout = "";
    let stderr = "";

    try {
      const result = await execFileAsync("codex", args, {
        cwd: input.cwd,
        maxBuffer: 10 * 1024 * 1024,
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string };
      stdout = execErr.stdout ?? "";
      stderr = execErr.stderr ?? "";

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

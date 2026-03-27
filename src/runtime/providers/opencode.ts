import { isExecutableInPath, writeJson, writeText } from "../../utils/fs.js";
import { spawnCollect } from "../../utils/process.js";
import { generateRunId, tracePaths } from "../artifacts.js";
import type { ProviderAdapter, RunProviderInput, RunRoleResult } from "../provider-adapter.js";

export const opencodeAdapter: ProviderAdapter = {
  id: "opencode",

  async detect(_cwd: string): Promise<boolean> {
    return isExecutableInPath("opencode");
  },

  async run(input: RunProviderInput): Promise<RunRoleResult> {
    const available = await isExecutableInPath("opencode");
    if (!available) {
      return {
        ok: false,
        provider: "opencode",
        role: input.role,
        model: input.model,
        code: "provider_unavailable",
        message: 'Binary "opencode" not found in PATH.',
        retryable: false,
      };
    }

    const runId = generateRunId();
    const paths = tracePaths(input.cwd, runId);
    const fullPrompt = `${input.prompt}\n\n## Task\n\n${input.task}`;

    await writeJson(paths.request, {
      role: input.role,
      provider: "opencode",
      model: input.model,
      sandbox: input.sandbox,
      featureSlug: input.featureSlug,
      task: input.task,
    });

    const args = ["run", "--model", input.model, "--format", "json", fullPrompt];

    const { stdout, stderr, code } = await spawnCollect("opencode", args, {
      cwd: input.cwd,
    });

    if (code !== 0) {
      await writeText(paths.stdout, stdout + (stderr ? `\n--- stderr ---\n${stderr}` : ""));
      await writeJson(paths.result, { ok: false, code: "execution_failed", message: stderr || "non-zero exit" });

      return {
        ok: false,
        provider: "opencode",
        role: input.role,
        model: input.model,
        runId,
        code: "execution_failed",
        message: stderr || "Process exited with non-zero code.",
        retryable: true,
      };
    }

    // Try to parse JSON output from opencode
    let summary = stdout.slice(0, 500);
    let sessionId: string | undefined;
    try {
      const parsed = JSON.parse(stdout) as { summary?: string; sessionId?: string };
      if (parsed.summary) summary = parsed.summary;
      if (parsed.sessionId) sessionId = parsed.sessionId;
    } catch {
      // Non-JSON output is fine — treat raw stdout as summary
    }

    await writeText(paths.stdout, stdout);
    await writeJson(paths.result, { ok: true, summary });

    return {
      ok: true,
      provider: "opencode",
      role: input.role,
      model: input.model,
      runId,
      sessionId,
      summary,
    };
  },
};

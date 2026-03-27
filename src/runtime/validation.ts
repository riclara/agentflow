import path from "node:path";

import { isExecutableInPath } from "../utils/fs.js";
import { featureDir } from "./artifacts.js";
import type { AgentId, ProviderId } from "./config.js";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Verify that the provider binary is available in PATH.
 */
export async function validateProviderAvailable(provider: ProviderId): Promise<void> {
  const binaries: Record<ProviderId, string> = {
    "claude-code": "claude",
    codex: "codex",
    opencode: "opencode",
  };
  const binary = binaries[provider];
  const available = await isExecutableInPath(binary);
  if (!available) {
    throw new ValidationError(`Provider "${provider}" binary "${binary}" not found in PATH.`);
  }
}

/**
 * Validate that an artifact path remains under cwd.
 */
export function validateArtifactPath(artifactPath: string, cwd: string): void {
  const resolved = path.resolve(artifactPath);
  const resolvedCwd = path.resolve(cwd);
  if (!resolved.startsWith(resolvedCwd + path.sep) && resolved !== resolvedCwd) {
    throw new ValidationError(`Artifact path "${artifactPath}" is outside workspace "${cwd}".`);
  }
}

/**
 * Enforce role-specific write restrictions.
 *
 * - planner    → may only write inside docs/features/<slug>/
 * - tester     → must not modify implementation files (src/)
 * - documenter → must not modify implementation or test files (src/, tests/, *.test.*)
 */
export function validateRoleArtifact(
  role: AgentId,
  writtenPath: string,
  featureSlug: string,
  cwd: string,
): void {
  const resolved = path.resolve(writtenPath);
  const resolvedCwd = path.resolve(cwd);

  if (role === "planner") {
    const allowed = path.resolve(featureDir(cwd, featureSlug));
    if (!resolved.startsWith(allowed + path.sep) && resolved !== allowed) {
      throw new ValidationError(
        `Planner may only write inside docs/features/${featureSlug}/, got "${writtenPath}".`,
      );
    }
    return;
  }

  if (role === "tester") {
    const srcDir = path.join(resolvedCwd, "src") + path.sep;
    if (resolved.startsWith(srcDir)) {
      throw new ValidationError(`Tester must not modify implementation files (src/), got "${writtenPath}".`);
    }
    return;
  }

  if (role === "documenter") {
    const srcDir = path.join(resolvedCwd, "src") + path.sep;
    const testsDir = path.join(resolvedCwd, "tests") + path.sep;
    const basename = path.basename(resolved);
    const isTestFile = /\.test\.[a-z]+$/i.test(basename) || /\.spec\.[a-z]+$/i.test(basename);
    if (resolved.startsWith(srcDir) || resolved.startsWith(testsDir) || isTestFile) {
      throw new ValidationError(
        `Documenter must not modify implementation or test files, got "${writtenPath}".`,
      );
    }
    return;
  }
}

/**
 * Validate sandbox value.
 */
export function validateSandbox(sandbox: string): asserts sandbox is "read-only" | "workspace-write" {
  if (sandbox !== "read-only" && sandbox !== "workspace-write") {
    throw new ValidationError(`Invalid sandbox value: "${sandbox}". Expected "read-only" or "workspace-write".`);
  }
}

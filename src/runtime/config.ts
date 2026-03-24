import path from "node:path";
import { z } from "zod";

import { exists, readJson, writeJson } from "../utils/fs.js";

export const CONFIG_FILE = ".agentflow.json";

export const ProviderId = z.enum(["claude-code", "codex", "opencode"]);
export type ProviderId = z.infer<typeof ProviderId>;

export const AgentId = z.enum(["planner", "implementer", "tester", "documenter"]);
export type AgentId = z.infer<typeof AgentId>;

export const AgentRoleConfigSchema = z.object({
  provider: ProviderId,
  model: z.string().min(1),
  sandbox: z.enum(["read-only", "workspace-write"]).default("workspace-write"),
  prompt: z.object({
    base: z.string().min(1),
    providerOverrides: z
      .object({
        "claude-code": z.string().optional(),
        codex: z.string().optional(),
        opencode: z.string().optional(),
      })
      .default({}),
  }),
  providerModels: z
    .object({
      "claude-code": z.string().optional(),
      codex: z.string().optional(),
      opencode: z.string().optional(),
    })
    .default({}),
});
export type AgentRoleConfig = z.infer<typeof AgentRoleConfigSchema>;

export const AgentflowRuntimeConfigSchema = z.object({
  $schema: z.string().min(1),
  version: z.string().min(1),
  tools: z.array(ProviderId).min(1),
  workflow: z.object({
    maxReviewIterations: z.number().int().min(1),
    testerExecutes: z.boolean(),
    testerAutoLoop: z.boolean(),
    planGranularity: z.string().min(1),
  }),
  project: z.object({
    language: z.string().min(1),
    framework: z.string().min(1),
    testRunner: z.string().min(1),
  }),
  runtime: z.object({
    mode: z.literal("cli-runtime"),
    traceDir: z.string().min(1),
    defaultProvider: ProviderId.optional(),
  }),
  roles: z.object({
    planner: AgentRoleConfigSchema,
    implementer: AgentRoleConfigSchema,
    tester: AgentRoleConfigSchema,
    documenter: AgentRoleConfigSchema,
  }),
});
export type AgentflowRuntimeConfig = z.infer<typeof AgentflowRuntimeConfigSchema>;

export function isLegacyConfig(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return "models" in obj && !("roles" in obj);
}

export async function readRuntimeConfig(cwd: string): Promise<AgentflowRuntimeConfig | null> {
  const configPath = path.join(cwd, CONFIG_FILE);
  if (!(await exists(configPath))) {
    return null;
  }
  const raw = await readJson(configPath);
  const result = AgentflowRuntimeConfigSchema.safeParse(raw);
  if (!result.success) {
    return null;
  }
  return result.data;
}

export async function writeRuntimeConfig(cwd: string, config: AgentflowRuntimeConfig): Promise<void> {
  const configPath = path.join(cwd, CONFIG_FILE);
  await writeJson(configPath, config);
}

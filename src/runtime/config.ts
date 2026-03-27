import path from "node:path";
import { z } from "zod";

import { exists, readJson, writeJson } from "../utils/fs.js";
import { renderClassifierPrompt } from "../templates/prompts/classifier.js";

export const CONFIG_FILE = ".agentflow.json";

export const ProviderId = z.enum(["claude-code", "codex", "opencode"]);
export type ProviderId = z.infer<typeof ProviderId>;

export const AgentId = z.enum(["planner", "implementer", "tester", "documenter", "classifier"]);
export type AgentId = z.infer<typeof AgentId>;

export const AgentRoleConfigSchema = z.object({
  provider: ProviderId,
  model: z.string().min(1),
  effort: z.string().optional(),
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
    testRunner: z.string().optional(),
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
    classifier: AgentRoleConfigSchema,
  }),
});
export type AgentflowRuntimeConfig = z.infer<typeof AgentflowRuntimeConfigSchema>;

export function isLegacyConfig(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return "models" in obj && !("roles" in obj);
}

const CLASSIFIER_MODEL_DEFAULTS: Record<string, string> = {
  "claude-code": "haiku",
  codex: "gpt-5.4-mini",
  opencode: "anthropic/claude-haiku-4-5-20251001",
};

export async function readRuntimeConfig(cwd: string): Promise<AgentflowRuntimeConfig | null> {
  const configPath = path.join(cwd, CONFIG_FILE);
  if (!(await exists(configPath))) {
    return null;
  }
  const raw = await readJson(configPath) as Record<string, unknown>;

  // Backfill classifier for configs created before it was a required role
  if (raw && typeof raw === "object" && "roles" in raw) {
    const roles = raw.roles as Record<string, unknown>;
    if (!roles.classifier) {
      const defaultProvider =
        ((raw.runtime as Record<string, unknown>)?.defaultProvider as string) ??
        ((raw.tools as string[])?.[0]);
      roles.classifier = {
        provider: defaultProvider,
        model: CLASSIFIER_MODEL_DEFAULTS[defaultProvider] ?? "haiku",
        sandbox: "workspace-write",
        prompt: { base: renderClassifierPrompt(), providerOverrides: {} },
        providerModels: {},
      };
    }
  }

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

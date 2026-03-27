import path from "node:path";

import { CONFIG_FILE, normalizePathAlias, validateConfig } from "../core/schema.js";
import { isLegacyConfig, readRuntimeConfig, writeRuntimeConfig } from "../runtime/config.js";
import { AgentflowRuntimeConfigSchema } from "../runtime/config.js";
import { exists, readJson, writeJson } from "../utils/fs.js";
import { success } from "../utils/logger.js";

async function readRawConfig(cwd: string): Promise<Record<string, unknown>> {
  const configPath = path.join(cwd, CONFIG_FILE);
  if (!(await exists(configPath))) {
    throw new Error("No .agentflow.json found. Run `agentflow init` first.");
  }
  return readJson(configPath) as Promise<Record<string, unknown>>;
}

function getValueAtPath(obj: unknown, segments: string[]): unknown {
  let cursor = obj;
  for (const seg of segments) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[seg];
  }
  return cursor;
}

function setValueAtPath(obj: Record<string, unknown>, segments: string[], value: unknown): void {
  let cursor = obj;
  for (const seg of segments.slice(0, -1)) {
    const next = cursor[seg];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      throw new Error(`Config path segment "${seg}" is not an object.`);
    }
    cursor = next as Record<string, unknown>;
  }
  const leaf = segments.at(-1);
  if (!leaf) throw new Error("Empty config path.");
  if (!(leaf in cursor)) {
    throw new Error(`Unknown config path segment: "${leaf}".`);
  }
  cursor[leaf] = value;
}

function coerce(rawValue: string, current: unknown): unknown {
  if (typeof current === "number") {
    const n = Number.parseInt(rawValue, 10);
    if (Number.isNaN(n)) throw new Error(`Expected a number, got "${rawValue}".`);
    return n;
  }
  if (typeof current === "boolean") {
    if (rawValue === "true") return true;
    if (rawValue === "false") return false;
    throw new Error(`Expected "true" or "false", got "${rawValue}".`);
  }
  return rawValue;
}

export async function showConfigCommand(cwd: string): Promise<void> {
  const raw = await readRawConfig(cwd);
  console.log(JSON.stringify(raw, null, 2));
}

export async function getConfigCommand(cwd: string, targetPath: string): Promise<void> {
  const raw = await readRawConfig(cwd);
  const segments = normalizePathAlias(targetPath).split(".");
  const value = getValueAtPath(raw, segments);
  if (typeof value === "undefined") {
    throw new Error(`Unknown config path: ${targetPath}`);
  }
  if (typeof value === "object") {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  console.log(String(value));
}

export async function setConfigCommand(cwd: string, targetPath: string, rawValue: string): Promise<void> {
  const raw = await readRawConfig(cwd) as Record<string, unknown>;
  const segments = normalizePathAlias(targetPath).split(".");
  const current = getValueAtPath(raw, segments);
  if (typeof current === "undefined") {
    throw new Error(`Unknown config path: ${targetPath}`);
  }

  const coerced = coerce(rawValue, current);
  setValueAtPath(raw, segments, coerced);

  // Validate: if runtime config, parse with Zod
  if (!isLegacyConfig(raw)) {
    const result = AgentflowRuntimeConfigSchema.safeParse(raw);
    if (!result.success) {
      throw new Error(`Invalid config after update: ${result.error.issues.map((i) => i.message).join(", ")}`);
    }
    await writeRuntimeConfig(cwd, result.data);
  } else {
    // Legacy: validate before writing back
    const rawUnknown: unknown = raw;
    validateConfig(rawUnknown);
    const configPath = path.join(cwd, CONFIG_FILE);
    await writeJson(configPath, rawUnknown);
  }

  success(`Updated ${targetPath}.`);
}

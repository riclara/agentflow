import { appendFile } from "node:fs/promises";
import path from "node:path";

import { ensureDir, ensureParentDir } from "../utils/fs.js";

export function slugify(description: string): string {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50)
    .replace(/-+$/, "");
  if (!slug) {
    return `feature-${Date.now()}`;
  }
  return slug;
}

export function generateRunId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${ts}-${suffix}`;
}

export function featureDir(cwd: string, slug: string): string {
  return path.join(cwd, "docs", "features", slug);
}

export async function createFeatureDir(cwd: string, slug: string): Promise<string> {
  const dir = featureDir(cwd, slug);
  await ensureDir(dir);
  return dir;
}

export interface FeatureArtifactPaths {
  plan: string;
  review: string;
  activityLog: string;
}

export function featureArtifactPaths(cwd: string, slug: string): FeatureArtifactPaths {
  const dir = featureDir(cwd, slug);
  return {
    plan: path.join(dir, "plan.md"),
    review: path.join(dir, "review.md"),
    activityLog: path.join(dir, "activity.log"),
  };
}

export function traceDir(cwd: string, runId: string): string {
  return path.join(cwd, ".agentflow", "runs", runId);
}

export async function createTraceDir(cwd: string, runId: string): Promise<string> {
  const dir = traceDir(cwd, runId);
  await ensureDir(dir);
  return dir;
}

export interface TracePaths {
  request: string;
  stdout: string;
  result: string;
}

export function tracePaths(cwd: string, runId: string): TracePaths {
  const dir = traceDir(cwd, runId);
  return {
    request: path.join(dir, "request.json"),
    stdout: path.join(dir, "stdout.log"),
    result: path.join(dir, "result.json"),
  };
}

export async function appendActivityLog(logPath: string, entry: string): Promise<void> {
  await ensureParentDir(logPath);
  const timestamp = new Date().toISOString();
  await appendFile(logPath, `[${timestamp}] ${entry}\n`, "utf8");
}

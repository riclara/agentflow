import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

export async function exists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function isExecutableInPath(binaryName: string): Promise<boolean> {
  const pathValue = process.env.PATH;
  if (!pathValue) {
    return false;
  }

  for (const segment of pathValue.split(path.delimiter)) {
    const candidate = path.join(segment, binaryName);
    try {
      await access(candidate, constants.X_OK);
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

export async function ensureDir(targetPath: string): Promise<void> {
  await mkdir(targetPath, { recursive: true });
}

export async function ensureParentDir(targetPath: string): Promise<void> {
  await ensureDir(path.dirname(targetPath));
}

export async function readText(targetPath: string): Promise<string> {
  return readFile(targetPath, "utf8");
}

export async function readTextIfExists(targetPath: string): Promise<string | null> {
  if (!(await exists(targetPath))) {
    return null;
  }

  return readText(targetPath);
}

export async function writeText(targetPath: string, content: string): Promise<void> {
  await ensureParentDir(targetPath);
  await writeFile(targetPath, content, "utf8");
}

export async function readJson(targetPath: string): Promise<unknown> {
  const raw = await readText(targetPath);
  return JSON.parse(raw) as unknown;
}

export async function writeJson(targetPath: string, value: unknown): Promise<void> {
  await writeText(targetPath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function removeFileIfExists(targetPath: string): Promise<void> {
  if (!(await exists(targetPath))) {
    return;
  }

  await rm(targetPath);
}

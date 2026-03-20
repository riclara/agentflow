import { NPM_PACKAGE_NAME } from "../core/schema.js";

const NPM_LATEST_URL = `https://registry.npmjs.org/${encodeURIComponent(NPM_PACKAGE_NAME)}/latest`;
const VERSION_TIMEOUT_MS = 3_000;

export async function checkForUpdate(currentVersion: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERSION_TIMEOUT_MS);

  try {
    const response = await fetch(NPM_LATEST_URL, {
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { version?: unknown };
    if (typeof payload.version !== "string") {
      return null;
    }

    return isNewer(payload.version, currentVersion) ? payload.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function isNewer(latest: string, current: string): boolean {
  const latestParts = parseVersion(latest);
  const currentParts = parseVersion(current);

  if (!latestParts || !currentParts) {
    return false;
  }

  for (let index = 0; index < Math.max(latestParts.length, currentParts.length); index += 1) {
    const latestValue = latestParts[index] ?? 0;
    const currentValue = currentParts[index] ?? 0;

    if (latestValue > currentValue) {
      return true;
    }

    if (latestValue < currentValue) {
      return false;
    }
  }

  return false;
}

function parseVersion(version: string): number[] | null {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10));
  return parts.every((part) => Number.isInteger(part)) ? parts : null;
}

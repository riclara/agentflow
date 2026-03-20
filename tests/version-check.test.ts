import { describe, expect, it } from "vitest";

import { isNewer } from "../src/utils/version-check.js";

describe("isNewer", () => {
  it('returns true for "1.1.0" over "1.0.0"', () => {
    expect(isNewer("1.1.0", "1.0.0")).toBe(true);
  });

  it('returns true for "2.0.0" over "1.9.9"', () => {
    expect(isNewer("2.0.0", "1.9.9")).toBe(true);
  });

  it('returns false for identical versions', () => {
    expect(isNewer("1.0.0", "1.0.0")).toBe(false);
  });

  it('returns false when latest is older', () => {
    expect(isNewer("0.9.0", "1.0.0")).toBe(false);
  });

  it('returns true for patch increments', () => {
    expect(isNewer("1.0.1", "1.0.0")).toBe(true);
  });
});

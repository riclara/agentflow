import { describe, expect, it } from "vitest";

import { getCodexModelNotices, mapModelForTool, mapModelsForTool } from "../src/core/models.js";

describe("model mapping", () => {
  it("maps shorthand names to codex models", () => {
    expect(mapModelForTool("codex", "opus")).toBe("gpt-5-codex");
    expect(mapModelForTool("codex", "sonnet")).toBe("gpt-5.4-mini");
    expect(mapModelForTool("codex", "gpt-mini")).toBe("gpt-5.4-mini");
  });

  it("maps shorthand names to opencode provider strings", () => {
    expect(mapModelForTool("opencode", "haiku")).toBe("anthropic/claude-haiku-4-5-20251001");
  });

  it("summarizes codex notices only when the model changes", () => {
    const notices = getCodexModelNotices({
      planner: "opus",
      implementer: "gpt-5.4-mini",
      tester: "sonnet",
      documenter: "haiku",
    });

    expect(notices).toEqual([
      { agent: "planner", selected: "opus", mapped: "gpt-5-codex" },
      { agent: "tester", selected: "sonnet", mapped: "gpt-5.4-mini" },
      { agent: "documenter", selected: "haiku", mapped: "gpt-5.4-mini" },
    ]);
  });

  it("maps whole model sets per tool", () => {
    expect(
      mapModelsForTool("codex", {
        planner: "opus",
        implementer: "sonnet",
        tester: "sonnet",
        documenter: "haiku",
      }),
    ).toEqual({
      planner: "gpt-5-codex",
      implementer: "gpt-5.4-mini",
      tester: "gpt-5.4-mini",
      documenter: "gpt-5.4-mini",
    });
  });
});
